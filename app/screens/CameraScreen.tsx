import { useMemo, useState } from "react";
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { LoadingOverlay } from "../components/LoadingOverlay";
import { PrimaryButton } from "../components/PrimaryButton";
import { TextField } from "../components/TextField";
import { analyzeCarImages } from "../services/api";
import { saveCarAnalysis } from "../services/carService";
import { supabase } from "../services/supabase";
import { uploadCarImage } from "../services/storage";
import type { RootStackParamList } from "../types";
import { logError, logInfo, logWarn } from "../utils/logger";
import { calculateEstimatedValue, estimateBasePrice } from "../utils/valuation";

type CameraScreenProps = NativeStackScreenProps<RootStackParamList, "Camera">;

const MIN_IMAGES = 3;
const MAX_IMAGES = 5;

export function CameraScreen({ navigation }: CameraScreenProps) {
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();

  const isVehicleInfoValid = useMemo(() => {
    const year = Number(vehicleYear.trim());
    const currentYear = new Date().getFullYear();
    const isYearValid =
      /^\d{4}$/.test(vehicleYear.trim()) && year >= 1886 && year <= currentYear + 1;

    return Boolean(vehicleMake.trim() && vehicleModel.trim() && isYearValid);
  }, [vehicleYear, vehicleMake, vehicleModel]);

  const canAnalyze = useMemo(
    () => images.length >= MIN_IMAGES && isVehicleInfoValid,
    [images.length, isVehicleInfoValid]
  );
  const previewSize = useMemo(() => {
    const horizontalPadding = 32; // 16 left + 16 right from screen content
    const gaps = 16; // 8 + 8 for 3 columns
    return Math.floor((width - horizontalPadding - gaps) / 3);
  }, [width]);

  async function addFromCamera() {
    try {
      if (images.length >= MAX_IMAGES) {
        Alert.alert("Limit reached", `You can upload up to ${MAX_IMAGES} images.`);
        return;
      }

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
        logInfo("CameraScreen", "Captured camera image.", { count: result.assets.length });
        setImages((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      logError("CameraScreen", error, { stage: "addFromCamera" });
      Alert.alert("Camera error", "Could not capture image.");
    }
  }

  async function addFromLibrary() {
    try {
      if (images.length >= MAX_IMAGES) {
        Alert.alert("Limit reached", `You can upload up to ${MAX_IMAGES} images.`);
        return;
      }

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
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - images.length,
        quality: 0.8
      });

      if (!result.canceled && result.assets.length > 0) {
        logInfo("CameraScreen", "Selected images from library.", { count: result.assets.length });
        setImages((prev) => {
          const nextUris = result.assets.map((asset) => asset.uri);
          return [...prev, ...nextUris].slice(0, MAX_IMAGES);
        });
      }
    } catch (error) {
      logError("CameraScreen", error, { stage: "addFromLibrary" });
      Alert.alert("Library error", "Could not select images.");
    }
  }

  async function handleAnalyze() {
    if (images.length < MIN_IMAGES) {
      Alert.alert("Need more photos", `Please add at least ${MIN_IMAGES} photos.`);
      return;
    }

    if (!isVehicleInfoValid) {
      Alert.alert("Vehicle details required", "Enter a valid year, make, and model first.");
      return;
    }

    const knownVehicle = {
      year: Number(vehicleYear.trim()),
      make: vehicleMake.trim(),
      model: vehicleModel.trim()
    };

    setLoading(true);
    let stage = "auth";
    try {
      logInfo("CameraScreen", "Analyze request started.", {
        imageCount: images.length,
        knownVehicle
      });

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message ?? "You need to be logged in.");
      }

      stage = "upload_images";
      const uploaded = await Promise.all(
        images.map((uri, index) => uploadCarImage(uri, user.id, index))
      );
      const analysisImageUrls = uploaded.map((item) => item.analysisUrl);
      const storedImageUrls = uploaded.map((item) => item.publicUrl);
      logInfo("CameraScreen", "Images uploaded.", {
        count: analysisImageUrls.length,
        usingSignedUrls: true
      });

      stage = "invoke_ai";
      const analysis = await analyzeCarImages(analysisImageUrls, knownVehicle);
      const resolvedAnalysis = {
        ...analysis,
        make: knownVehicle.make,
        model: knownVehicle.model,
        year: knownVehicle.year
      };

      logInfo("CameraScreen", "AI analysis received.", {
        make: resolvedAnalysis.make,
        model: resolvedAnalysis.model,
        year: resolvedAnalysis.year
      });

      stage = "valuation";
      const basePrice = estimateBasePrice(
        resolvedAnalysis.make,
        resolvedAnalysis.model,
        resolvedAnalysis.year
      );
      const estimatedValue = calculateEstimatedValue(basePrice, resolvedAnalysis.condition);

      stage = "save_database";
      const savedCar = await saveCarAnalysis({
        userId: user.id,
        imageUrls: storedImageUrls,
        analysisResult: resolvedAnalysis,
        estimatedValue
      });

      logInfo("CameraScreen", "Analysis saved successfully.", { carId: savedCar.id });
      navigation.replace("Result", { car: savedCar });
    } catch (error: any) {
      logError("CameraScreen", error, { stage, imageCount: images.length });
      Alert.alert("Analysis failed", error?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingOverlay message="Analyzing car..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Capture Car Photos</Text>
        <Text style={styles.subtitle}>
          Take or upload {MIN_IMAGES} to {MAX_IMAGES} images from different angles.
        </Text>
        <Text style={styles.sectionTitle}>Vehicle Details</Text>

        <View style={styles.formGroup}>
          <TextField
            label="Year"
            value={vehicleYear}
            onChangeText={setVehicleYear}
            keyboardType="number-pad"
            autoCapitalize="none"
          />
          <TextField
            label="Make"
            value={vehicleMake}
            onChangeText={setVehicleMake}
            autoCapitalize="words"
          />
          <TextField
            label="Model"
            value={vehicleModel}
            onChangeText={setVehicleModel}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.buttonGroup}>
          <PrimaryButton title="Take Photo" onPress={addFromCamera} />
          <PrimaryButton title="Upload From Library" onPress={addFromLibrary} variant="secondary" />
        </View>

        <Text style={styles.counter}>
          Photos: {images.length}/{MAX_IMAGES}
        </Text>

        <View style={styles.previewGrid}>
          {images.map((uri, index) => (
            <View
              key={`${uri}-${index}`}
              style={[
                styles.previewCell,
                {
                  width: previewSize,
                  height: previewSize
                }
              ]}
            >
              <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
            </View>
          ))}
        </View>

        <PrimaryButton
          title="Analyze Car"
          onPress={handleAnalyze}
          disabled={!canAnalyze}
          loading={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF4FA"
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0A1728"
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#35516D"
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0A1728"
  },
  formGroup: {
    gap: 10
  },
  buttonGroup: {
    gap: 10
  },
  counter: {
    fontSize: 14,
    color: "#27415E",
    fontWeight: "600"
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  previewCell: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFDBE9",
    overflow: "hidden",
    backgroundColor: "#DEE7F1"
  },
  previewImage: {
    width: "100%",
    height: "100%"
  }
});
