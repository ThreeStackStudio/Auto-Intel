import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ConditionBar } from "../components/ConditionBar";
import { PrimaryButton } from "../components/PrimaryButton";
import type { RootStackParamList } from "../types";
import { formatCurrency, formatPercent } from "../utils/format";

type ResultScreenProps = NativeStackScreenProps<RootStackParamList, "Result">;

export function ResultScreen({ navigation, route }: ResultScreenProps) {
  const { car } = route.params;
  const details = car.analysis[0];
  const confidence = Number(car.confidence ?? 0);
  const exteriorScore = Number(details?.exterior_score ?? 0);
  const interiorScore = Number(details?.interior_score ?? 0);
  const tireScore = Number(details?.tire_score ?? 0);
  const damageScore = Number(details?.damage_score ?? 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Valuation Result</Text>

        <View style={styles.card}>
          <Text style={styles.carName}>
            {car.year} {car.make} {car.model}
          </Text>
          <Text style={styles.price}>{formatCurrency(car.estimated_value)}</Text>
          <Text style={styles.confidence}>Confidence: {formatPercent(confidence)}</Text>
        </View>

        {details ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Condition Breakdown</Text>
            <ConditionBar label="Exterior" value={exteriorScore} />
            <ConditionBar label="Interior" value={interiorScore} />
            <ConditionBar label="Tires" value={tireScore} />
            <ConditionBar label="Damage" value={damageScore} inverse />

            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{details.summary}</Text>
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
  }
});
