import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
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
import { TextField } from "../components/TextField";
import { analyzeCarImages, verifyCarPhoto } from "../services/api";
import { saveCarAnalysis } from "../services/carService";
import { supabase } from "../services/supabase";
import { uploadCarImage } from "../services/storage";
import { useAppTheme, type AppColors } from "../theme";
import type { PhotoView, RootStackParamList } from "../types";
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

const MAX_MILEAGE_KM = 2_000_000;
const MAX_USER_DETAILS_LENGTH = 220;

function pickFirstIncomplete(captured: Partial<Record<PhotoView, CapturedShot>>) {
  return REQUIRED_STEPS.find((step) => !captured[step.id])?.id ?? REQUIRED_STEPS[REQUIRED_STEPS.length - 1].id;
}

export function CameraScreen({ navigation }: CameraScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleMileageKm, setVehicleMileageKm] = useState("");
  const [userProvidedDetails, setUserProvidedDetails] = useState("");
  const [capturedShots, setCapturedShots] = useState<Partial<Record<PhotoView, CapturedShot>>>({});
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<PhotoView | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const isCancelledRef = useRef(false);

  const parsedYear = Number(vehicleYear.trim());
  const parsedMileage = Number(vehicleMileageKm.replace(/[^\d]/g, ""));
  const isVehicleInfoValid = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const isYearValid =
      /^\d{4}$/.test(vehicleYear.trim()) && parsedYear >= 1886 && parsedYear <= currentYear + 1;
    const isMileageValid = Number.isFinite(parsedMileage) && parsedMileage >= 0 && parsedMileage <= MAX_MILEAGE_KM;

    return Boolean(vehicleMake.trim() && vehicleModel.trim() && isYearValid && isMileageValid);
  }, [vehicleYear, vehicleMake, vehicleModel, parsedYear, parsedMileage]);

  const completedCount = REQUIRED_STEPS.reduce((count, step) => count + (capturedShots[step.id] ? 1 : 0), 0);
  const canAnalyze = completedCount === REQUIRED_STEPS.length && isVehicleInfoValid;
  const activeStepId = selectedStepId ?? pickFirstIncomplete(capturedShots);
  const activeStep = REQUIRED_STEPS.find((step) => step.id === activeStepId) ?? REQUIRED_STEPS[0];
  const activeShot = capturedShots[activeStep.id];

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
    Alert.alert("Vehicle details required", "Enter make, model, year, and mileage (km) before photos.");
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Vehicle Intake</Text>
        <Text style={styles.subtitle}>
          Enter vehicle details, then complete each required photo with automatic angle verification.
        </Text>

        <Text style={styles.sectionTitle}>Vehicle Details</Text>
        <View style={styles.formGroup}>
          <TextField
            label="Year"
            value={vehicleYear}
            onChangeText={setVehicleYear}
            keyboardType="number-pad"
            autoCapitalize="none"
            placeholder="e.g. 2019"
          />
          <TextField
            label="Make"
            value={vehicleMake}
            onChangeText={setVehicleMake}
            autoCapitalize="words"
            placeholder="e.g. Honda"
          />
          <TextField
            label="Model"
            value={vehicleModel}
            onChangeText={setVehicleModel}
            autoCapitalize="words"
            placeholder="e.g. Civic"
          />
          <TextField
            label="Mileage (km)"
            value={vehicleMileageKm}
            onChangeText={(value) => setVehicleMileageKm(value.replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
            autoCapitalize="none"
            placeholder="e.g. 125000"
          />
          <TextField
            label="Recent work or upgrades (optional)"
            value={userProvidedDetails}
            onChangeText={(value) => setUserProvidedDetails(value.slice(0, MAX_USER_DETAILS_LENGTH))}
            autoCapitalize="sentences"
            placeholder="e.g. New brakes + tires last month"
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
    </SafeAreaView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
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
    fieldHint: {
      fontSize: 12,
      color: colors.textSubtle,
      lineHeight: 18
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
