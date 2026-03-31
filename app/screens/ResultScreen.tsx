import { Alert, Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ConditionBar } from "../components/ConditionBar";
import { PrimaryButton } from "../components/PrimaryButton";
import type { RootStackParamList } from "../types";
import { formatCurrency, formatPercent } from "../utils/format";

type ResultScreenProps = NativeStackScreenProps<RootStackParamList, "Result">;
const USD_TO_CAD_RATE = 1.36;

function toCadAmount(price: number, currency: string | undefined) {
  if (String(currency ?? "").toUpperCase() === "USD") {
    return Math.round(price * USD_TO_CAD_RATE);
  }
  return Math.round(price);
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
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
          <Text style={styles.price}>{formatCurrency(car.estimated_value)}</Text>
          <Text style={styles.meta}>All monetary values shown in CAD</Text>
          <Text style={styles.confidence}>Confidence: {formatPercent(confidence)}</Text>
        </View>

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
                  Base market value from comps: {formatCurrency(details.base_market_value)}
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
                  <Text key={`${mod.name}-${index}`} style={styles.summary}>
                    {mod.name}: {mod.impactPercent >= 0 ? "+" : ""}
                    {mod.impactPercent}% {mod.notes ? `(${mod.notes})` : ""}
                  </Text>
                ))}
              </>
            ) : null}

            {listings.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Market Comps</Text>
                {listings.slice(0, 4).map((listing, index) => (
                  <View key={`${listing.title}-${index}`} style={styles.compItem}>
                    <Text style={styles.summary}>
                      {listing.source}: {listing.title} - {formatCurrency(toCadAmount(listing.price, listing.currency))}
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

        <PrimaryButton title="Scan Another Car" onPress={() => navigation.navigate("Camera")} />
        <PrimaryButton title="Back to Home" onPress={() => navigation.navigate("Home")} variant="secondary" />
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
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8E2EF",
    padding: 14,
    gap: 10
  },
  carName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0A1728"
  },
  price: {
    fontSize: 34,
    fontWeight: "900",
    color: "#0B5D1E"
  },
  confidence: {
    fontSize: 14,
    color: "#35516D",
    fontWeight: "600"
  },
  meta: {
    fontSize: 14,
    color: "#35516D",
    fontWeight: "600"
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0A1728",
    marginTop: 6
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    color: "#25425E"
  },
  compItem: {
    gap: 4
  },
  link: {
    fontSize: 14,
    color: "#0E4F8A",
    fontWeight: "700",
    textDecorationLine: "underline"
  }
});
