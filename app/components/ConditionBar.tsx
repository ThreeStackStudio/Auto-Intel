import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { useAppTheme, type AppColors } from "../theme";
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const normalized = clamp01(value);
  const visualValue = inverse ? 1 - normalized : normalized;
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: visualValue,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [visualValue]);

  const widthPct = animWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatPercent(visualValue)}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: widthPct }]} />
      </View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
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
      color: colors.text,
      fontWeight: "600"
    },
    value: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "600"
    },
    track: {
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.conditionTrack,
      overflow: "hidden"
    },
    fill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: colors.conditionFill
    }
  });
}
