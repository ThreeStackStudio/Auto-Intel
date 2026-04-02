import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

import { ConditionBar } from "./ConditionBar";
import { useAppTheme, type AppColors } from "../theme";
import { useExchangeRate } from "../hooks/useExchangeRate";
import type { CarWithRelations } from "../types";
import { formatCurrency, formatDate, formatPercent } from "../utils/format";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function toCad(price: number, currency: string | undefined, rate: number) {
  return String(currency ?? "").toUpperCase() === "USD"
    ? Math.round(price * rate)
    : Math.round(price);
}

async function openUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const final = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const supported = await Linking.canOpenURL(final);
    if (!supported) {
      Alert.alert("Can't open link", "This listing URL is not supported.");
      return;
    }
    await Linking.openURL(final);
  } catch {
    Alert.alert("Can't open link", "Something went wrong.");
  }
}

type CarListItemProps = {
  car: CarWithRelations;
  onPress: () => void;
  index?: number;
};

const CONFIDENCE_HELP_TEXT =
  "Confidence reflects photo quality and coverage, vehicle detail consistency, and how many reliable market comps were matched.";

export function CarListItem({ car, onPress, index = 0 }: CarListItemProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const usdToCadRate = useExchangeRate();
  const [expanded, setExpanded] = useState(false);
  const [showConfidenceHelp, setShowConfidenceHelp] = useState(false);

  const mileage =
    car.mileage_km !== null
      ? `${new Intl.NumberFormat("en-US").format(car.mileage_km)} km`
      : "Mileage N/A";

  const analysisItems = Array.isArray(car.analysis) ? car.analysis : [];
  const details = analysisItems[0];
  const mods = details?.detected_mods ?? [];
  const listings = details?.market_listings ?? [];
  const confidence = Number(car.confidence ?? 0);
  const lowValue = Number(details?.low_value ?? 0);
  const highValue = Number(details?.high_value ?? 0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const chevronAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        delay: index * 65,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        delay: index * 65,
        damping: 22,
        stiffness: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function toggleExpanded() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextExpanded = !expanded;
    Animated.timing(chevronAnim, {
      toValue: nextExpanded ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setExpanded(nextExpanded);
    if (!nextExpanded) {
      setShowConfidenceHelp(false);
    }
  }

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {car.year} {car.make} {car.model}
          </Text>
          <View style={styles.headerRight}>
            <Text style={styles.value}>{formatCurrency(car.estimated_value)}</Text>
            <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotate }] }]}>
              ▼
            </Animated.Text>
          </View>
        </View>
        <Text style={styles.meta}>{mileage}</Text>
        <Text style={styles.meta}>{formatDate(car.created_at)}</Text>

        {expanded && (
          <View style={styles.expandedPanel}>
            <View style={styles.divider} />
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
            {lowValue > 0 && highValue > 0 ? (
              <Text style={styles.range}>{formatCurrency(lowValue)} – {formatCurrency(highValue)}</Text>
            ) : null}

            {details ? (
              <>
                <Text style={styles.sectionLabel}>Condition</Text>
                <ConditionBar label="Exterior" value={details.exterior_score} />
                <ConditionBar label="Interior" value={details.interior_score} />
                <ConditionBar label="Tires" value={details.tire_score} />
                <ConditionBar label="Damage-Free" value={details.damage_score} inverse />

                {details.summary ? (
                  <>
                    <Text style={styles.sectionLabel}>Summary</Text>
                    <Text style={styles.summary}>{details.summary}</Text>
                  </>
                ) : null}

                {mods.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Detected Mods</Text>
                    {mods.slice(0, 3).map((mod, i) => (
                      <Text key={`${mod.name}-${i}`} style={styles.summary}>
                        {mod.name}: {mod.impactPercent >= 0 ? "+" : ""}
                        {mod.impactPercent}%{mod.notes ? ` (${mod.notes})` : ""}
                      </Text>
                    ))}
                  </>
                )}

                {listings.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Market Comps</Text>
                    {listings.slice(0, 2).map((listing, i) => (
                      <View key={`${listing.title}-${i}`} style={styles.compItem}>
                        <Text style={styles.summary}>
                          {listing.source}: {listing.title} —{" "}
                          {formatCurrency(toCad(listing.price, listing.currency, usdToCadRate))}
                        </Text>
                        {listing.url?.trim() ? (
                          <Text
                            style={styles.link}
                            onPress={() => void openUrl(listing.url)}
                          >
                            View listing
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </>
                )}
              </>
            ) : (
              <Text style={styles.summary}>No detailed analysis available.</Text>
            )}

            <Pressable
              onPress={onPress}
              style={({ pressed }) => [styles.fullReportButton, pressed && styles.fullReportPressed]}
            >
              <Text style={styles.fullReportText}>View Full Report →</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    pressed: {
      opacity: 0.9,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    title: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      fontWeight: "700",
    },
    value: {
      fontSize: 16,
      color: colors.success,
      fontWeight: "800",
    },
    chevron: {
      fontSize: 11,
      color: colors.textSubtle,
    },
    meta: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "500",
    },
    expandedPanel: {
      gap: 10,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 2,
    },
    confidence: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "600",
    },
    confidenceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    infoButton: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceMuted,
    },
    infoButtonPressed: {
      opacity: 0.75,
    },
    infoButtonText: {
      fontSize: 11,
      fontWeight: "800",
      color: colors.textMuted,
    },
    confidenceHelp: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSubtle,
    },
    range: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "500",
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.text,
      marginTop: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    summary: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
    },
    compItem: {
      gap: 2,
    },
    link: {
      fontSize: 13,
      color: colors.link,
      fontWeight: "700",
      textDecorationLine: "underline",
    },
    fullReportButton: {
      marginTop: 4,
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: "center",
    },
    fullReportPressed: {
      opacity: 0.75,
    },
    fullReportText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.link,
    },
  });
}
