import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { LoadingOverlay } from "../components/LoadingOverlay";
import { PrimaryButton } from "../components/PrimaryButton";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import { useDraftScan } from "../hooks/useDraftScan";
import type { DraftCapturedShot } from "../hooks/useDraftScan";
import { analyzeCarImages, verifyCarPhoto } from "../services/api";
import { saveCarAnalysis } from "../services/carService";
import { supabase } from "../services/supabase";
import { uploadCarImage } from "../services/storage";
import { decodeVin, getMakesForYear, getModelsForYearMake, isVinFormatValid, sanitizeVinInput } from "../services/vehicleData";
import { useAppTheme, type AppColors } from "../theme";
import type { IntakeMethod, MakeOption, ModelOption, PhotoView, RootStackParamList, VinDecodeResult } from "../types";
import { logError, logInfo, logWarn } from "../utils/logger";
import { calculateEstimatedValue, estimateBasePrice } from "../utils/valuation";

type CameraScreenProps = NativeStackScreenProps<RootStackParamList, "Camera">;

type CaptureStep = {
  id: PhotoView;
  label: string;
  verificationHint: string;
};

type CapturedShot = {
  localUri: string;
  publicUrl: string;
  analysisUrl: string;
  verificationConfidence: number;
};

const REQUIRED_STEPS: CaptureStep[] = [
  {
    id: "front",
    label: "Front",
    verificationHint: "Frame the full front fascia and headlights."
  },
  {
    id: "driver_side",
    label: "Driver Side",
    verificationHint: "Capture the full driver side profile."
  },
  {
    id: "passenger_side",
    label: "Passenger Side",
    verificationHint: "Capture the full passenger side profile."
  },
  {
    id: "rear",
    label: "Rear",
    verificationHint: "Capture the rear bumper, trunk/hatch, and taillights."
  },
  {
    id: "interior",
    label: "Interior",
    verificationHint: "Show dashboard, seats, and cabin condition."
  },
  {
    id: "tire_tread",
    label: "Tire Tread",
    verificationHint: "Close-up of one tire so tread wear is clearly visible."
  }
];

const MIN_YEAR = 1981;
const MAX_MILEAGE_KM = 2_000_000;
const MAX_USER_DETAILS_LENGTH = 220;

function pickFirstIncomplete(captured: Partial<Record<PhotoView, CapturedShot>>) {
  return REQUIRED_STEPS.find((step) => !captured[step.id])?.id ?? REQUIRED_STEPS[REQUIRED_STEPS.length - 1].id;
}

function normalizeOptionLookup(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findMatchingOptionValue<T extends { value: string; label: string }>(options: T[], candidate?: string | null) {
  const target = normalizeOptionLookup(String(candidate ?? ""));
  if (!target) return null;
  const matched = options.find((option) => {
    const byValue = normalizeOptionLookup(option.value);
    const byLabel = normalizeOptionLookup(option.label);
    return byValue === target || byLabel === target;
  });
  return matched?.value ?? null;
}

function buildVinDecodeSummary(decoded: VinDecodeResult) {
  const primary = [decoded.year ? String(decoded.year) : "", decoded.make ?? "", decoded.model ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const secondary = [decoded.trim ?? "", decoded.bodyStyle ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" | ");
  if (!primary && !secondary) return "No vehicle details found from VIN.";
  if (!secondary) return primary;
  return `${primary} | ${secondary}`;
}

export function CameraScreen({ navigation }: CameraScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [intakeMethod, setIntakeMethod] = useState<IntakeMethod>("vin_lookup");
  const [vinInput, setVinInput] = useState("");
  const [vinDecodedResult, setVinDecodedResult] = useState<VinDecodeResult | null>(null);
  const [vinLookupError, setVinLookupError] = useState<string | null>(null);
  const [isVinLookupLoading, setIsVinLookupLoading] = useState(false);
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleMileageKm, setVehicleMileageKm] = useState("");
  const [userProvidedDetails, setUserProvidedDetails] = useState("");
  const [makeOptions, setMakeOptions] = useState<MakeOption[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [isMakeOptionsLoading, setIsMakeOptionsLoading] = useState(false);
  const [isModelOptionsLoading, setIsModelOptionsLoading] = useState(false);
  const [makeOptionsError, setMakeOptionsError] = useState<string | null>(null);
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null);
  const [capturedShots, setCapturedShots] = useState<Partial<Record<PhotoView, CapturedShot>>>({});
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<PhotoView | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const isCancelledRef = useRef(false);
  const draftResolved = useRef(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const makeRequestIdRef = useRef(0);
  const modelRequestIdRef = useRef(0);
  const { draftLoaded, draft, saveDraft, clearDraft } = useDraftScan();

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let year = currentYear + 1; year >= MIN_YEAR; year -= 1) {
      const text = String(year);
      options.push({ value: text, label: text });
    }
    return options;
  }, [currentYear]);

  function handleInputFocus(event: any) {
    const target = event.nativeEvent.target;
    if (!target) return;

    setTimeout(() => {
      (scrollViewRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(target, 120, true);
    }, 80);
  }

  async function loadMakeOptionsForYear(yearValue: string) {
    const year = Number(yearValue);
    if (!Number.isInteger(year)) {
      setMakeOptions([]);
      setMakeOptionsError(null);
      setIsMakeOptionsLoading(false);
      return [];
    }

    const requestId = ++makeRequestIdRef.current;
    setMakeOptionsError(null);
    setIsMakeOptionsLoading(true);
    try {
      const options = await getMakesForYear(year);
      if (requestId !== makeRequestIdRef.current) return [];
      setMakeOptions(options);
      return options;
    } catch (error: any) {
      if (requestId !== makeRequestIdRef.current) return [];
      setMakeOptions([]);
      setMakeOptionsError(error?.message ?? "Could not load makes.");
      return [];
    } finally {
      if (requestId === makeRequestIdRef.current) {
        setIsMakeOptionsLoading(false);
      }
    }
  }

  async function loadModelOptions(yearValue: string, makeValue: string) {
    const year = Number(yearValue);
    const normalizedMake = makeValue.trim();
    if (!Number.isInteger(year) || !normalizedMake) {
      setModelOptions([]);
      setModelOptionsError(null);
      setIsModelOptionsLoading(false);
      return [];
    }

    const requestId = ++modelRequestIdRef.current;
    setModelOptionsError(null);
    setIsModelOptionsLoading(true);
    try {
      const options = await getModelsForYearMake(year, normalizedMake);
      if (requestId !== modelRequestIdRef.current) return [];
      setModelOptions(options);
      return options;
    } catch (error: any) {
      if (requestId !== modelRequestIdRef.current) return [];
      setModelOptions([]);
      setModelOptionsError(error?.message ?? "Could not load models.");
      return [];
    } finally {
      if (requestId === modelRequestIdRef.current) {
        setIsModelOptionsLoading(false);
      }
    }
  }

  async function handleYearChange(
    nextYear: string,
    prefill?: {
      make?: string | null;
      model?: string | null;
    }
  ) {
    makeRequestIdRef.current += 1;
    setIsMakeOptionsLoading(false);
    modelRequestIdRef.current += 1;
    setIsModelOptionsLoading(false);
    setVehicleYear(nextYear);
    setVehicleMake("");
    setVehicleModel("");
    setModelOptions([]);
    setModelOptionsError(null);

    if (!nextYear) {
      setMakeOptions([]);
      setMakeOptionsError(null);
      return;
    }

    const loadedMakes = await loadMakeOptionsForYear(nextYear);
    const prefillMake = prefill?.make ?? null;
    if (!prefillMake) return;

    const matchedMake = findMatchingOptionValue(loadedMakes, prefillMake);
    if (!matchedMake) return;

    setVehicleMake(matchedMake);
    const loadedModels = await loadModelOptions(nextYear, matchedMake);
    const matchedModel = findMatchingOptionValue(loadedModels, prefill?.model ?? null);
    if (matchedModel) {
      setVehicleModel(matchedModel);
    }
  }

  async function handleMakeChange(nextMake: string, prefillModel?: string | null) {
    modelRequestIdRef.current += 1;
    setIsModelOptionsLoading(false);
    setVehicleMake(nextMake);
    setVehicleModel("");
    setModelOptions([]);
    setModelOptionsError(null);

    if (!vehicleYear.trim() || !nextMake.trim()) {
      return;
    }

    const loadedModels = await loadModelOptions(vehicleYear, nextMake);
    if (!prefillModel) return;
    const matchedModel = findMatchingOptionValue(loadedModels, prefillModel);
    if (matchedModel) {
      setVehicleModel(matchedModel);
    }
  }

  async function handleVinLookup() {
    const normalizedVin = sanitizeVinInput(vinInput);
    setVinInput(normalizedVin);
    setVinLookupError(null);
    setIntakeMethod("vin_lookup");

    if (!isVinFormatValid(normalizedVin)) {
      const message = "VIN must be 17 characters and cannot include I, O, or Q.";
      setVinLookupError(message);
      Alert.alert("Invalid VIN", message);
      return;
    }

    setIsVinLookupLoading(true);
    try {
      const decoded = await decodeVin(normalizedVin);
      setVinDecodedResult(decoded);
      if (decoded.year) {
        await handleYearChange(String(decoded.year), {
          make: decoded.make,
          model: decoded.model
        });
      }

      const hasCoreFields = Boolean(decoded.year && decoded.make && decoded.model);
      if (!hasCoreFields || decoded.isPartial) {
        Alert.alert(
          "VIN decoded with partial data",
          "Some details are missing or uncertain. Please finish with manual Year/Make/Model selection."
        );
      }
    } catch (error: any) {
      const message = error?.message ?? "Could not decode VIN right now.";
      setVinLookupError(message);
      Alert.alert("VIN lookup failed", `${message} You can continue with manual selection.`);
    } finally {
      setIsVinLookupLoading(false);
    }
  }

  const parsedYear = Number(vehicleYear.trim());
  const parsedMileage = Number(vehicleMileageKm.replace(/[^\d]/g, ""));
  const isYearValid =
    /^\d{4}$/.test(vehicleYear.trim()) && parsedYear >= MIN_YEAR && parsedYear <= currentYear + 1;
  const isMileageValid = Number.isFinite(parsedMileage) && parsedMileage >= 0 && parsedMileage <= MAX_MILEAGE_KM;
  const isVehicleInfoValid = useMemo(() => {
    return Boolean(vehicleMake.trim() && vehicleModel.trim() && isYearValid && isMileageValid);
  }, [vehicleMake, vehicleModel, isYearValid, isMileageValid]);

  const completedCount = REQUIRED_STEPS.reduce((count, step) => count + (capturedShots[step.id] ? 1 : 0), 0);
  const canAnalyze = completedCount === REQUIRED_STEPS.length && isVehicleInfoValid;
  const activeStepId = selectedStepId ?? pickFirstIncomplete(capturedShots);
  const activeStep = REQUIRED_STEPS.find((step) => step.id === activeStepId) ?? REQUIRED_STEPS[0];
  const activeShot = capturedShots[activeStep.id];
  const vinPreviewText = vinDecodedResult ? buildVinDecodeSummary(vinDecodedResult) : "";
  const vinLengthMessage = vinInput.length > 0 ? `${vinInput.length}/17` : "";

  // Offer to resume a saved draft once AsyncStorage has been read.
  useEffect(() => {
    if (!draftLoaded) return;

    const photoCount = Object.keys(draft?.capturedShots ?? {}).length;
    const hasContent =
      draft !== null &&
      (draft.vinInput.trim() ||
        draft.vehicleYear.trim() ||
        draft.vehicleMake.trim() ||
        draft.vehicleModel.trim() ||
        draft.vehicleMileageKm.trim() ||
        photoCount > 0);

    if (!hasContent) {
      draftResolved.current = true;
      return;
    }

    const vehicleLabel = [draft!.vehicleYear, draft!.vehicleMake, draft!.vehicleModel]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    const body = vehicleLabel
      ? `${vehicleLabel} - ${photoCount} of ${REQUIRED_STEPS.length} photos captured.`
      : `${photoCount} of ${REQUIRED_STEPS.length} photos captured.`;

    Alert.alert("Resume previous scan?", body, [
      {
        text: "Start Fresh",
        style: "cancel",
        onPress: () => {
          clearDraft();
          draftResolved.current = true;
        }
      },
      {
        text: "Resume",
        onPress: () => {
          setIntakeMethod(draft!.intakeMethod);
          setVinInput(draft!.vinInput);
          setVinDecodedResult(draft!.vinDecodedResult);
          setVehicleYear(draft!.vehicleYear);
          setVehicleMake(draft!.vehicleMake);
          setVehicleModel(draft!.vehicleModel);
          setVehicleMileageKm(draft!.vehicleMileageKm);
          setUserProvidedDetails(draft!.userProvidedDetails);
          const restoredShots: Partial<Record<PhotoView, CapturedShot>> = {};
          for (const [key, draftShot] of Object.entries(draft!.capturedShots) as [PhotoView, DraftCapturedShot][]) {
            restoredShots[key] = {
              localUri: draftShot.publicUrl,
              publicUrl: draftShot.publicUrl,
              analysisUrl: draftShot.analysisUrl,
              verificationConfidence: draftShot.verificationConfidence
            };
          }
          setCapturedShots(restoredShots);

          if (draft!.vehicleYear) {
            void handleYearChange(draft!.vehicleYear, {
              make: draft!.vehicleMake,
              model: draft!.vehicleModel
            });
          }

          draftResolved.current = true;
        }
      }
    ]);
  }, [draftLoaded, draft, clearDraft]);

  // Auto-save draft whenever form or photos change.
  useEffect(() => {
    if (!draftResolved.current) return;
    const draftShots: Partial<Record<PhotoView, DraftCapturedShot>> = {};
    for (const [key, shot] of Object.entries(capturedShots) as [PhotoView, CapturedShot][]) {
      draftShots[key] = {
        publicUrl: shot.publicUrl,
        analysisUrl: shot.analysisUrl,
        verificationConfidence: shot.verificationConfidence
      };
    }
    saveDraft({
      intakeMethod,
      vinInput,
      vinDecodedResult,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      vehicleMileageKm,
      userProvidedDetails,
      capturedShots: draftShots
    });
  }, [
    intakeMethod,
    vinInput,
    vinDecodedResult,
    vehicleYear,
    vehicleMake,
    vehicleModel,
    vehicleMileageKm,
    userProvidedDetails,
    capturedShots,
    saveDraft
  ]);

  function getKnownVehicle() {
    if (!isVehicleInfoValid) {
      throw new Error("Enter valid make, model, year, and mileage (km) first.");
    }

    return {
      make: vehicleMake.trim(),
      model: vehicleModel.trim(),
      year: parsedYear,
      mileageKm: parsedMileage
    };
  }

  async function verifyAndStorePhoto(localUri: string) {
    let stage = "auth";
    try {
      const knownVehicle = getKnownVehicle();
      setLoadingMessage(`Verifying ${activeStep.label.toLowerCase()} photo...`);

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message ?? "You need to be logged in.");
      }

      stage = "upload_photo";
      const uploaded = await uploadCarImage(localUri, user.id, `${activeStep.id}-${Date.now()}`);

      stage = "verify_photo";
      if (activeStep.id === "passenger_side" && !capturedShots.driver_side) {
        Alert.alert(
          "Driver side required first",
          "Capture and verify the driver side photo before the passenger side so both can be compared."
        );
        return;
      }
      const referenceSideUrl =
        activeStep.id === "passenger_side" ? capturedShots.driver_side?.analysisUrl : undefined;
      const verification = await verifyCarPhoto(
        uploaded.analysisUrl,
        activeStep.id,
        knownVehicle,
        referenceSideUrl
      );

      if (!verification.isMatch) {
        const mismatchMessage = `${activeStep.label} check failed. Detected: ${verification.detectedView}. ${verification.reason || "Please retake."}`;
        Alert.alert("Photo didn't match required angle", mismatchMessage);
        return;
      }

      setCapturedShots((prev) => ({
        ...prev,
        [activeStep.id]: {
          localUri,
          publicUrl: uploaded.publicUrl,
          analysisUrl: uploaded.analysisUrl,
          verificationConfidence: verification.confidence
        }
      }));
      setSelectedStepId(null);

      logInfo("CameraScreen", "Photo verified and stored.", {
        step: activeStep.id,
        confidence: verification.confidence
      });
    } catch (error: any) {
      logError("CameraScreen", error, { stage, step: activeStep.id });
      Alert.alert("Photo verification failed", error?.message ?? "Please try again.");
    } finally {
      setLoadingMessage(null);
    }
  }

  function enforceVehicleDetailsBeforePhotos() {
    if (isVehicleInfoValid) return true;
    Alert.alert("Vehicle details required", "Select valid year, make, model, and mileage (km) before photos.");
    return false;
  }

  async function addFromCamera() {
    try {
      if (!enforceVehicleDetailsBeforePhotos()) return;

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        logWarn("CameraScreen", "Camera permission denied.");
        Alert.alert("Camera permission needed", "Enable camera permissions to continue.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.8
      });

      if (!result.canceled && result.assets.length > 0) {
        await verifyAndStorePhoto(result.assets[0].uri);
      }
    } catch (error) {
      logError("CameraScreen", error, { stage: "addFromCamera" });
      Alert.alert("Camera error", "Could not capture image.");
    }
  }

  async function addFromLibrary() {
    try {
      if (!enforceVehicleDetailsBeforePhotos()) return;

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        logWarn("CameraScreen", "Library permission denied.");
        Alert.alert("Library permission needed", "Enable photo access to continue.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        allowsMultipleSelection: false,
        quality: 0.8
      });

      if (!result.canceled && result.assets.length > 0) {
        await verifyAndStorePhoto(result.assets[0].uri);
      }
    } catch (error) {
      logError("CameraScreen", error, { stage: "addFromLibrary" });
      Alert.alert("Library error", "Could not select image.");
    }
  }

  function clearActiveShot() {
    setCapturedShots((prev) => {
      const next = { ...prev };
      delete next[activeStep.id];
      return next;
    });
  }

  function handleCancelAnalysis() {
    isCancelledRef.current = true;
    setIsAnalysing(false);
    setLoadingMessage(null);
  }

  async function handleAnalyze() {
    if (!canAnalyze) {
      Alert.alert(
        "Capture all required photos",
        "Complete all six verified photos and vehicle details before running analysis."
      );
      return;
    }

    isCancelledRef.current = false;
    setIsAnalysing(true);
    setLoadingMessage("Running full vehicle analysis...");
    let stage = "analyze";
    try {
      const knownVehicle = getKnownVehicle();
      const orderedShots = REQUIRED_STEPS.map((step) => {
        const shot = capturedShots[step.id];
        if (!shot) {
          throw new Error(`Missing required photo: ${step.label}`);
        }
        return { step, shot };
      });

      const imageSet = orderedShots.map(({ step, shot }) => ({
        view: step.id,
        url: shot.analysisUrl
      }));
      const trimmedUserDetails = userProvidedDetails.trim();

      stage = "invoke_ai";
      const analysis = await analyzeCarImages(
        imageSet,
        knownVehicle,
        trimmedUserDetails.length > 0 ? trimmedUserDetails : undefined
      );

      if (isCancelledRef.current) return;

      const resolvedAnalysis = {
        ...analysis,
        make: knownVehicle.make,
        model: knownVehicle.model,
        year: knownVehicle.year,
        mileageKm: knownVehicle.mileageKm
      };

      const fallbackBase = estimateBasePrice(
        resolvedAnalysis.make,
        resolvedAnalysis.model,
        resolvedAnalysis.year
      );
      const estimatedValue =
        resolvedAnalysis.marketValuation?.estimatedValue ??
        calculateEstimatedValue(
          fallbackBase,
          resolvedAnalysis.condition,
          resolvedAnalysis.mileageKm,
          resolvedAnalysis.year,
          resolvedAnalysis.detectedMods
        );

      if (isCancelledRef.current) return;

      stage = "save_database";
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message ?? "You need to be logged in.");
      }

      const savedCar = await saveCarAnalysis({
        userId: user.id,
        vin: isVinFormatValid(vinInput) ? sanitizeVinInput(vinInput) : null,
        mileageKm: knownVehicle.mileageKm,
        userNotes: trimmedUserDetails.length > 0 ? trimmedUserDetails : null,
        imageUrls: orderedShots.map(({ shot }) => shot.publicUrl),
        photoAngles: orderedShots.map(({ step }) => step.id),
        analysisResult: resolvedAnalysis,
        estimatedValue
      });

      logInfo("CameraScreen", "Analysis saved successfully.", {
        carId: savedCar.id,
        estimatedValue
      });
      clearDraft();
      navigation.replace("Result", { car: savedCar });
    } catch (error: any) {
      if (!isCancelledRef.current) {
        logError("CameraScreen", error, { stage });
        Alert.alert("Analysis failed", error?.message ?? "Please try again.");
      }
    } finally {
      setIsAnalysing(false);
      setLoadingMessage(null);
    }
  }

  if (loadingMessage) {
    return <LoadingOverlay message={loadingMessage} onCancel={isAnalysing ? handleCancelAnalysis : undefined} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Vehicle Intake</Text>
          <Text style={styles.subtitle}>
            Identify the vehicle first, then complete each required photo with automatic angle verification.
          </Text>

          <Text style={styles.sectionTitle}>Vehicle Identification</Text>
          <View style={styles.methodToggleWrap}>
            <Pressable
              onPress={() => setIntakeMethod("vin_lookup")}
              style={({ pressed }) => [
                styles.methodChip,
                intakeMethod === "vin_lookup" && styles.methodChipActive,
                pressed && styles.methodChipPressed
              ]}
            >
              <Text style={[styles.methodChipText, intakeMethod === "vin_lookup" && styles.methodChipTextActive]}>
                VIN Lookup
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIntakeMethod("manual_selection")}
              style={({ pressed }) => [
                styles.methodChip,
                intakeMethod === "manual_selection" && styles.methodChipActive,
                pressed && styles.methodChipPressed
              ]}
            >
              <Text style={[styles.methodChipText, intakeMethod === "manual_selection" && styles.methodChipTextActive]}>
                Manual Selection
              </Text>
            </Pressable>
          </View>
          <Text style={styles.fieldHint}>
            VIN lookup is optional. If VIN decode is incomplete or fails, continue with manual Year/Make/Model.
          </Text>

          {intakeMethod === "vin_lookup" ? (
            <View style={styles.formGroup}>
              <TextField
                label="VIN (optional)"
                value={vinInput}
                onChangeText={(value) => {
                  setVinInput(sanitizeVinInput(value));
                  setVinLookupError(null);
                }}
                autoCapitalize="characters"
                placeholder="17-character VIN"
                onFocus={handleInputFocus}
              />
              <Text style={styles.fieldHint}>VIN rules: 17 chars, letters and numbers, no I/O/Q. {vinLengthMessage}</Text>
              {vinLookupError ? <Text style={styles.errorText}>{vinLookupError}</Text> : null}
              <PrimaryButton
                title="Lookup VIN"
                onPress={handleVinLookup}
                loading={isVinLookupLoading}
                disabled={isVinLookupLoading || vinInput.trim().length === 0}
              />
              {vinDecodedResult ? (
                <View style={styles.vinResultCard}>
                  <Text style={styles.vinResultTitle}>Decoded VIN</Text>
                  <Text style={styles.vinResultText}>{vinPreviewText}</Text>
                  {vinDecodedResult.isPartial ? (
                    <Text style={styles.fieldHint}>Some fields may need manual correction.</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Vehicle Details</Text>
          <View style={styles.formGroup}>
            <SelectField
              label="Year"
              value={vehicleYear}
              options={yearOptions}
              onChange={(value) => {
                void handleYearChange(value);
              }}
              placeholder="Select year"
            />
            <SelectField
              label="Make"
              value={vehicleMake}
              options={makeOptions}
              onChange={(value) => {
                void handleMakeChange(value);
              }}
              placeholder={vehicleYear ? "Select make" : "Select year first"}
              disabled={!vehicleYear}
              loading={isMakeOptionsLoading}
            />
            {makeOptionsError ? <Text style={styles.errorText}>{makeOptionsError}</Text> : null}
            <SelectField
              label="Model"
              value={vehicleModel}
              options={modelOptions}
              onChange={(value) => setVehicleModel(value)}
              placeholder={vehicleMake ? "Select model" : "Select year and make first"}
              disabled={!vehicleYear || !vehicleMake}
              loading={isModelOptionsLoading}
            />
            {modelOptionsError ? <Text style={styles.errorText}>{modelOptionsError}</Text> : null}
            <TextField
              label="Mileage (km)"
              value={vehicleMileageKm}
              onChangeText={(value) => setVehicleMileageKm(value.replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
              autoCapitalize="none"
              placeholder="e.g. 125000"
              onFocus={handleInputFocus}
            />
            <TextField
              label="Recent work or upgrades (optional)"
              value={userProvidedDetails}
              onChangeText={(value) => setUserProvidedDetails(value.slice(0, MAX_USER_DETAILS_LENGTH))}
              autoCapitalize="sentences"
              placeholder="e.g. New brakes + tires last month"
              onFocus={handleInputFocus}
            />
            <Text style={styles.fieldHint}>
              Add a short note about repairs, maintenance, or upgrades not obvious from photos (
              {userProvidedDetails.length}/{MAX_USER_DETAILS_LENGTH}).
            </Text>
          </View>

          <Text style={styles.sectionTitle}>
            Required Photos ({completedCount}/{REQUIRED_STEPS.length})
          </Text>
          <View style={styles.stepsList}>
            {REQUIRED_STEPS.map((step, index) => {
              const shot = capturedShots[step.id];
              const isActive = step.id === activeStep.id;
              return (
                <Pressable
                  key={step.id}
                  onPress={() => setSelectedStepId(step.id)}
                  style={({ pressed }) => [
                    styles.stepCard,
                    shot ? styles.stepDone : styles.stepPending,
                    isActive && styles.stepActive,
                    pressed && styles.stepPressed
                  ]}
                >
                  <View style={styles.stepTextWrap}>
                    <Text style={styles.stepLabel}>
                      {index + 1}. {step.label}
                    </Text>
                    <Text style={styles.stepStatus}>
                      {shot
                        ? `Verified (${Math.round(shot.verificationConfidence * 100)}%) - tap to retake`
                        : "Waiting for photo"}
                    </Text>
                  </View>
                  {shot ? <Image source={{ uri: shot.localUri }} style={styles.stepThumb} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.activePanel}>
            <Text style={styles.activeTitle}>
              {activeShot ? `Retake: ${activeStep.label}` : `Active Step: ${activeStep.label}`}
            </Text>
            <Text style={styles.activeHint}>{activeStep.verificationHint}</Text>
            {activeShot ? <Image source={{ uri: activeShot.localUri }} style={styles.activePreview} /> : null}
            <View style={styles.buttonGroup}>
              <PrimaryButton title={activeShot ? "Retake With Camera" : "Take Photo"} onPress={addFromCamera} />
              <PrimaryButton
                title={activeShot ? "Replace From Library" : "Upload From Library"}
                onPress={addFromLibrary}
                variant="secondary"
              />
              {activeShot ? (
                <PrimaryButton title="Clear Current Photo" onPress={clearActiveShot} variant="secondary" />
              ) : null}
            </View>
          </View>

          <PrimaryButton title="Run Analysis" onPress={handleAnalyze} disabled={!canAnalyze} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    keyboardContainer: {
      flex: 1
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 28,
      gap: 14
    },
    title: {
      fontSize: 28,
      fontWeight: "900",
      color: colors.text
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text
    },
    formGroup: {
      gap: 10
    },
    methodToggleWrap: {
      flexDirection: "row",
      gap: 8
    },
    methodChip: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8
    },
    methodChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.secondarySurface
    },
    methodChipPressed: {
      opacity: 0.82
    },
    methodChipText: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: "700"
    },
    methodChipTextActive: {
      color: colors.onSecondarySurface
    },
    vinResultCard: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      gap: 4
    },
    vinResultTitle: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "700"
    },
    vinResultText: {
      fontSize: 14,
      color: colors.text
    },
    fieldHint: {
      fontSize: 12,
      color: colors.textSubtle,
      lineHeight: 18
    },
    errorText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.danger
    },
    stepsList: {
      gap: 8
    },
    stepCard: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10
    },
    stepPending: {
      borderColor: colors.stepPendingBorder,
      backgroundColor: colors.stepPendingBackground
    },
    stepDone: {
      borderColor: colors.stepDoneBorder,
      backgroundColor: colors.stepDoneBackground
    },
    stepActive: {
      borderColor: colors.stepActiveBorder,
      borderWidth: 2
    },
    stepPressed: {
      opacity: 0.75
    },
    stepTextWrap: {
      flex: 1,
      gap: 4
    },
    stepLabel: {
      fontSize: 15,
      color: colors.text,
      fontWeight: "700"
    },
    stepStatus: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "500"
    },
    stepThumb: {
      width: 56,
      height: 56,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong
    },
    activePanel: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 10
    },
    activeTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text
    },
    activeHint: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted
    },
    activePreview: {
      width: "100%",
      height: 180,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border
    },
    buttonGroup: {
      gap: 10
    }
  });
}

