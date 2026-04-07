import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import { ConditionBar } from "../components/ConditionBar";
import { PrimaryButton } from "../components/PrimaryButton";
import { useAppTheme, type AppColors } from "../theme";
import { useExchangeRate } from "../hooks/useExchangeRate";
import type { CarRow, RootStackParamList } from "../types";
import { ValuationHistoryChart } from "../components/ValuationHistoryChart";
import { fetchValuationHistory } from "../services/carService";
import { formatCurrency, formatPercent } from "../utils/format";

type ResultScreenProps = NativeStackScreenProps<RootStackParamList, "Result">;
const CONFIDENCE_HELP_TEXT =
  "Confidence is based on photo quality and coverage, consistency of detected vehicle details, and how many reliable market listings were matched.";
type ValuationPdfPayload = {
  carTitle: string;
  mileageLabel: string;
  userNotes: string;
  estimatedValue: number;
  confidence: number;
  summary: string;
  exteriorScore: number;
  interiorScore: number;
  tireScore: number;
  damageScore: number;
  conditionFactor: number;
  mileageFactor: number;
  modsFactor: number;
  baseMarketValue: number | null;
  mods: { name: string; impactPercent: number; notes?: string }[];
  listings: { source: string; title: string; price: number; currency: string }[];
  usdToCadRate: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildList(items: string[]) {
  if (items.length === 0) return "<p class='muted'>None</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function buildValuationPdfHtml(payload: ValuationPdfPayload) {
  const listings = payload.listings.slice(0, 4).map((listing) => {
    const cadValue = toCadAmount(listing.price, listing.currency, payload.usdToCadRate);
    return `${listing.source}: ${listing.title} - ${formatCurrency(cadValue)}`;
  });
  const mods = payload.mods.map(
    (mod) => `${mod.name}: ${mod.impactPercent >= 0 ? "+" : ""}${mod.impactPercent}% ${mod.notes ? `(${mod.notes})` : ""}`.trim()
  );

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0A1728; padding: 22px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      h2 { margin: 22px 0 8px; font-size: 18px; }
      p { margin: 4px 0; line-height: 1.45; font-size: 14px; color: #25425E; }
      .price { color: #0B5D1E; font-size: 32px; font-weight: 800; margin: 8px 0; }
      .muted { color: #4F6478; }
      ul { margin-top: 6px; padding-left: 20px; }
      li { margin: 4px 0; line-height: 1.45; font-size: 14px; color: #25425E; }
      .card { border: 1px solid #D8E2EF; border-radius: 12px; padding: 14px; margin-top: 10px; }
    </style>
  </head>
  <body>
    <h1>Valuation Result</h1>
    <div class="card">
      <p><strong>${escapeHtml(payload.carTitle)}</strong></p>
      <p>Mileage: ${escapeHtml(payload.mileageLabel)}</p>
      <p class="price">${escapeHtml(formatCurrency(payload.estimatedValue))}</p>
      <p>Confidence: ${escapeHtml(formatPercent(payload.confidence))}</p>
      <p class="muted">All monetary values shown in CAD</p>
      ${payload.userNotes ? `<h2>Your Notes</h2><p>${escapeHtml(payload.userNotes)}</p>` : ""}
    </div>

    <div class="card">
      <h2>Condition Breakdown</h2>
      <p>Exterior: ${escapeHtml(formatPercent(payload.exteriorScore))}</p>
      <p>Interior: ${escapeHtml(formatPercent(payload.interiorScore))}</p>
      <p>Tires: ${escapeHtml(formatPercent(payload.tireScore))}</p>
      <p>Damage-Free: ${escapeHtml(formatPercent(payload.damageScore))}</p>
      <h2>Summary</h2>
      <p>${escapeHtml(payload.summary || "No summary available.")}</p>
      ${
        payload.baseMarketValue
          ? `<h2>Market Value Inputs</h2>
      <p>Base market value from comps: ${escapeHtml(formatCurrency(payload.baseMarketValue))}</p>
      <p>Condition factor: x${escapeHtml(payload.conditionFactor.toFixed(2))}</p>
      <p>Mileage factor: x${escapeHtml(payload.mileageFactor.toFixed(2))}</p>
      <p>Mods factor: x${escapeHtml(payload.modsFactor.toFixed(2))}</p>`
          : ""
      }
      <h2>Detected Mods</h2>
      ${buildList(mods)}
      <h2>Market Comps</h2>
      ${buildList(listings)}
    </div>
  </body>
</html>`;
}

function formatPhotoLabel(angle: string | null | undefined, index: number) {
  const trimmed = String(angle ?? "").trim();
  if (!trimmed) {
    return `Photo ${index + 1}`;
  }

  return trimmed
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toCadAmount(price: number, currency: string | undefined, rate: number) {
  if (String(currency ?? "").toUpperCase() === "USD") {
    return Math.round(price * rate);
  }
  return Math.round(price);
}

function formatDisplay(cadValue: number, currency: "CAD" | "USD", rate: number): string {
  const converted = currency === "USD" && rate > 0 ? cadValue / rate : cadValue;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Math.round(converted));
}

function formatImpactPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  const absolute = Math.abs(rounded);
  const amount = Number.isInteger(absolute) ? absolute.toFixed(0) : absolute.toFixed(1);
  return `${rounded >= 0 ? "+" : "-"}${amount}%`;
}

async function openListingUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;

  const hasScheme = /^https?:\/\//i.test(trimmed);
  const finalUrl = hasScheme ? trimmed : `https://${trimmed}`;

  try {
    const supported = await Linking.canOpenURL(finalUrl);
    if (!supported) {
      Alert.alert("Can't open link", "This listing URL is not supported on your device.");
      return;
    }
    await Linking.openURL(finalUrl);
  } catch {
    Alert.alert("Can't open link", "Something went wrong while trying to open this listing.");
  }
}

export function ResultScreen({ navigation, route }: ResultScreenProps) {
  const { colors } = useAppTheme();
  const usdToCadRate = useExchangeRate();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: viewportWidth } = useWindowDimensions();
  const { car } = route.params;
  const analysisItems = Array.isArray(car.analysis)
    ? car.analysis
    : car.analysis && typeof car.analysis === "object"
      ? [car.analysis]
      : [];
  const details = analysisItems[0];
  const confidence = Number(car.confidence ?? 0);
  const exteriorScore = Number(details?.exterior_score ?? 0);
  const interiorScore = Number(details?.interior_score ?? 0);
  const tireScore = Number(details?.tire_score ?? 0);
  const damageScore = Number(details?.damage_score ?? 0);
  const mileageLabel =
    car.mileage_km !== null && Number.isFinite(Number(car.mileage_km))
      ? `${new Intl.NumberFormat("en-US").format(Number(car.mileage_km))} km`
      : "N/A";
  const mods = details?.detected_mods ?? [];
  const listings = details?.market_listings ?? [];
  const conditionFactor = Number(details?.condition_adjustment_factor ?? 1);
  const mileageFactor = Number(details?.mileage_adjustment_factor ?? 1);
  const modsFactor = Number(details?.mods_adjustment_factor ?? 1);
  const userNotes = String(car.user_notes ?? "").trim();
  const photos = Array.isArray(car.images)
    ? car.images.filter((image) => typeof image.image_url === "string" && image.image_url.trim().length > 0)
    : [];

  const estimatedValue = car.estimated_value ?? 0;
  const lowValue = Number(details?.low_value ?? 0);
  const highValue = Number(details?.high_value ?? 0);
  const [displayPrice, setDisplayPrice] = useState(0);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [showConfidenceHelp, setShowConfidenceHelp] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<"CAD" | "USD">("CAD");
  const [valuationHistory, setValuationHistory] = useState<
    Pick<CarRow, "id" | "estimated_value" | "created_at">[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    fetchValuationHistory(car.make, car.model, car.year)
      .then(setValuationHistory)
      .finally(() => setHistoryLoading(false));
  }, []);

  const scrollViewRef = useRef<ScrollView | null>(null);
  const exportContentRef = useRef<View | null>(null);
  const priceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener = priceAnim.addListener(({ value }) => setDisplayPrice(Math.round(value)));
    Animated.timing(priceAnim, {
      toValue: estimatedValue,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => priceAnim.removeListener(listener);
  }, [estimatedValue]);

  function openGalleryAt(index: number) {
    setGalleryStartIndex(index);
    setIsGalleryVisible(true);
  }

  async function handleShareImage() {
    try {
      setIsSharingImage(true);
      if (!exportContentRef.current) {
        Alert.alert("Export failed", "Capture view is not ready yet. Please try again.");
        return;
      }

      const imageUri = await captureRef(exportContentRef.current, {
        format: "jpg",
        quality: 0.95,
        result: "tmpfile"
      });

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert("Sharing unavailable", "Image export worked, but this device cannot open a share sheet.");
        return;
      }

      await Sharing.shareAsync(imageUri, {
        mimeType: "image/jpeg",
        dialogTitle: "Share valuation image",
        UTI: "public.jpeg"
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      Alert.alert("Export failed", detail ? `Could not create an image.\n\n${detail}` : "Could not create an image for this valuation.");
    } finally {
      setIsSharingImage(false);
    }
  }

  async function handleSharePdf() {
    try {
      setIsSharingPdf(true);
      const html = buildValuationPdfHtml({
        carTitle: `${car.year} ${car.make} ${car.model}`,
        mileageLabel,
        userNotes,
        estimatedValue,
        confidence,
        summary: String(details?.summary ?? ""),
        exteriorScore,
        interiorScore,
        tireScore,
        damageScore,
        conditionFactor,
        mileageFactor,
        modsFactor,
        baseMarketValue: details?.base_market_value ?? null,
        mods: mods.map((mod) => ({
          name: mod.name,
          impactPercent: mod.impactPercent,
          notes: mod.notes
        })),
        listings: listings.map((listing) => ({
          source: listing.source,
          title: listing.title,
          price: listing.price,
          currency: listing.currency
        })),
        usdToCadRate
      });
      const { uri } = await Print.printToFileAsync({ html });

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert("PDF created", "PDF export worked, but this device cannot open a share sheet.");
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share valuation PDF",
        UTI: "com.adobe.pdf"
      });
    } catch {
      Alert.alert("Export failed", "Could not create a PDF for this valuation.");
    } finally {
      setIsSharingPdf(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content}>
        <View ref={exportContentRef} collapsable={false}>
          <Text style={styles.title}>Valuation Result</Text>

          <View style={styles.card}>
            <Text style={styles.carName}>
              {car.year} {car.make} {car.model}
            </Text>
            <Text style={styles.meta}>Mileage: {mileageLabel}</Text>
            {userNotes ? (
              <>
                <Text style={styles.sectionTitle}>Your Notes</Text>
                <Text style={styles.summary}>{userNotes}</Text>
              </>
            ) : null}
            <Text style={styles.price}>{formatDisplay(displayPrice, displayCurrency, usdToCadRate)}</Text>
            {lowValue > 0 && highValue > 0 ? (
              <Text style={styles.range}>{formatDisplay(lowValue, displayCurrency, usdToCadRate)} – {formatDisplay(highValue, displayCurrency, usdToCadRate)}</Text>
            ) : null}
            <View style={styles.currencyToggleRow}>
              <Pressable
                onPress={() => setDisplayCurrency("CAD")}
                style={[styles.currencyChip, displayCurrency === "CAD" && styles.currencyChipActive]}
              >
                <Text style={[styles.currencyChipText, displayCurrency === "CAD" && styles.currencyChipTextActive]}>CAD</Text>
              </Pressable>
              <Pressable
                onPress={() => setDisplayCurrency("USD")}
                style={[styles.currencyChip, displayCurrency === "USD" && styles.currencyChipActive]}
              >
                <Text style={[styles.currencyChipText, displayCurrency === "USD" && styles.currencyChipTextActive]}>USD</Text>
              </Pressable>
            </View>
            <View style={styles.confidenceRow}>
              <Text style={styles.confidence}>Confidence: {formatPercent(confidence)}</Text>
              <Pressable
                onPress={() => setShowConfidenceHelp((prev) => !prev)}
                style={({ pressed }) => [styles.infoButton, pressed && styles.infoButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Explain confidence score"
              >
                <Text style={styles.infoButtonText}>?</Text>
              </Pressable>
            </View>
            {showConfidenceHelp ? <Text style={styles.confidenceHelp}>{CONFIDENCE_HELP_TEXT}</Text> : null}
          </View>

          {(historyLoading || valuationHistory.length >= 2) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Valuation History</Text>
              {historyLoading ? (
                <Text style={styles.summary}>Loading history…</Text>
              ) : (
                <ValuationHistoryChart
                  data={valuationHistory.map((h) => ({
                    id: h.id,
                    value: h.estimated_value,
                    date: h.created_at,
                  }))}
                  currentCarId={car.id}
                />
              )}
            </View>
          )}

          {details ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Condition Breakdown</Text>
              <Text style={styles.summary}>Higher % means better condition on every bar.</Text>
              <ConditionBar label="Exterior" value={exteriorScore} />
              <ConditionBar label="Interior" value={interiorScore} />
              <ConditionBar label="Tires" value={tireScore} />
              <ConditionBar label="Damage-Free" value={damageScore} inverse />

              <Text style={styles.sectionTitle}>Summary</Text>
              <Text style={styles.summary}>{details.summary}</Text>

              {details.base_market_value ? (
                <>
                  <Text style={styles.sectionTitle}>Market Value Inputs</Text>
                  <Text style={styles.summary}>
                    Base market value from comps: {formatDisplay(details.base_market_value, displayCurrency, usdToCadRate)}
                  </Text>
                  <Text style={styles.summary}>
                    Condition factor: x{conditionFactor.toFixed(2)}
                  </Text>
                  <Text style={styles.summary}>
                    Mileage factor: x{mileageFactor.toFixed(2)}
                  </Text>
                  <Text style={styles.summary}>
                    Mods factor: x{modsFactor.toFixed(2)}
                  </Text>
                </>
              ) : null}

              {mods.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Detected Mods</Text>
                  {mods.map((mod, index) => (
                    <View key={`${mod.name}-${index}`} style={styles.modRow}>
                      <View style={styles.modHeaderRow}>
                        <Text style={styles.modName}>{mod.name}</Text>
                        <View
                          style={[
                            styles.modImpactPill,
                            mod.impactPercent >= 0 ? styles.modImpactPillPositive : styles.modImpactPillNegative
                          ]}
                        >
                          <Text
                            style={[
                              styles.modImpactText,
                              mod.impactPercent >= 0 ? styles.modImpactTextPositive : styles.modImpactTextNegative
                            ]}
                          >
                            {formatImpactPercent(mod.impactPercent)}
                          </Text>
                        </View>
                      </View>
                      {mod.notes ? <Text style={styles.modNotes}>{mod.notes}</Text> : null}
                    </View>
                  ))}
                </>
              ) : null}

              {listings.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Market Comps</Text>
                  {listings.slice(0, 4).map((listing, index) => (
                    <View key={`${listing.title}-${index}`} style={styles.compItem}>
                      <Text style={styles.summary}>
                        {listing.source}: {listing.title} - {formatDisplay(toCadAmount(listing.price, listing.currency, usdToCadRate), displayCurrency, usdToCadRate)}
                      </Text>
                      {typeof listing.url === "string" && listing.url.trim() ? (
                        <Text style={styles.link} onPress={() => void openListingUrl(listing.url)}>
                          View listing
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.summary}>No detailed analysis found for this scan.</Text>
            </View>
          )}

          {photos.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Photos Used</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                {photos.map((photo, index) => (
                  <Pressable
                    key={`${photo.id}-${index}`}
                    onPress={() => openGalleryAt(index)}
                    style={({ pressed }) => [styles.thumbWrap, pressed && styles.thumbPressed]}
                  >
                    <Image source={{ uri: photo.image_url }} style={styles.thumbImage} />
                    <Text style={styles.thumbLabel}>{formatPhotoLabel(photo.angle, index)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <PrimaryButton
          title="Share as Image"
          onPress={() => void handleShareImage()}
          loading={isSharingImage}
          disabled={isSharingPdf}
        />
        <PrimaryButton
          title="Share as PDF"
          onPress={() => void handleSharePdf()}
          loading={isSharingPdf}
          disabled={isSharingImage}
          variant="secondary"
        />
        <PrimaryButton title="Back to Home" onPress={() => navigation.navigate("Home")} variant="secondary" />
      </ScrollView>

      <Modal
        visible={isGalleryVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsGalleryVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Valuation Photos</Text>
            <Pressable
              onPress={() => setIsGalleryVisible(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: galleryStartIndex * viewportWidth, y: 0 }}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item, index }) => (
              <View style={[styles.slide, { width: viewportWidth }]}>
                <Image source={{ uri: item.image_url }} style={styles.slideImage} resizeMode="contain" />
                <Text style={styles.slideCaption}>
                  {formatPhotoLabel(item.angle, index)} ({index + 1}/{photos.length})
                </Text>
              </View>
            )}
          />
        </View>
      </Modal>
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
      paddingBottom: 24,
      gap: 14
    },
    title: {
      fontSize: 28,
      fontWeight: "900",
      color: colors.text
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10
    },
    carName: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text
    },
    price: {
      fontSize: 34,
      fontWeight: "900",
      color: colors.success
    },
    range: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: "600"
    },
    confidence: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: "600"
    },
    confidenceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    infoButton: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceMuted
    },
    infoButtonPressed: {
      opacity: 0.75
    },
    infoButtonText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.textMuted
    },
    confidenceHelp: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSubtle
    },
    meta: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: "600"
    },
    currencyToggleRow: {
      flexDirection: "row",
      gap: 6
    },
    currencyChip: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted
    },
    currencyChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.secondarySurface
    },
    currencyChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textMuted
    },
    currencyChipTextActive: {
      color: colors.primary
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
      marginTop: 6
    },
    summary: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted
    },
    modRow: {
      gap: 4
    },
    modHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10
    },
    modName: {
      flex: 1,
      fontSize: 15,
      lineHeight: 21,
      color: colors.textMuted,
      fontWeight: "600"
    },
    modImpactPill: {
      minWidth: 64,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    modImpactPillPositive: {
      backgroundColor: colors.stepDoneBackground,
      borderColor: colors.stepDoneBorder
    },
    modImpactPillNegative: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.danger
    },
    modImpactText: {
      fontSize: 12,
      fontWeight: "800"
    },
    modImpactTextPositive: {
      color: colors.success
    },
    modImpactTextNegative: {
      color: colors.danger
    },
    modNotes: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSubtle
    },
    compItem: {
      gap: 4
    },
    link: {
      fontSize: 14,
      color: colors.link,
      fontWeight: "700",
      textDecorationLine: "underline"
    },
    galleryRow: {
      gap: 10
    },
    thumbWrap: {
      width: 94,
      gap: 6
    },
    thumbPressed: {
      opacity: 0.8
    },
    thumbImage: {
      width: 94,
      height: 70,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border
    },
    thumbLabel: {
      fontSize: 12,
      color: colors.textSubtle,
      fontWeight: "600"
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.88)",
      justifyContent: "center"
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 42,
      paddingBottom: 8
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: "#FFFFFF"
    },
    closeButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: "rgba(255, 255, 255, 0.14)"
    },
    closePressed: {
      opacity: 0.7
    },
    closeButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700"
    },
    slide: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 42
    },
    slideImage: {
      width: "100%",
      height: "78%"
    },
    slideCaption: {
      marginTop: 10,
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "600"
    }
  });
}
