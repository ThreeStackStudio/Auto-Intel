import { StyleSheet, Text, View } from "react-native";

import { formatPercent } from "../utils/format";

type ConditionBarProps = {
  label: string;
  value: number | string | null | undefined;
  inverse?: boolean;
};

function clamp01(value: number | string | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

export function ConditionBar({ label, value, inverse = false }: ConditionBarProps) {
  const normalized = clamp01(value);
  const visualValue = inverse ? 1 - normalized : normalized;
  const displayedValue = visualValue;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatPercent(displayedValue)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(visualValue * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  label: {
    fontSize: 14,
    color: "#0A1728",
    fontWeight: "600"
  },
  value: {
    fontSize: 13,
    color: "#2A4D74",
    fontWeight: "600"
  },
  track: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#D6E1ED",
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0E4F8A"
  }
});
