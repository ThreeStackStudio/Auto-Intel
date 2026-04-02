import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useAppTheme, type AppColors } from "../theme";

export function SkeletonCard() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleBar} />
        <View style={styles.valueBar} />
      </View>
      <View style={styles.metaBarWide} />
      <View style={styles.metaBarNarrow} />
    </Animated.View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.skeletonCard,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12
    },
    titleBar: {
      flex: 1,
      height: 16,
      borderRadius: 6,
      backgroundColor: colors.skeletonBarStrong
    },
    valueBar: {
      width: 72,
      height: 16,
      borderRadius: 6,
      backgroundColor: colors.skeletonBar
    },
    metaBarWide: {
      width: "55%",
      height: 12,
      borderRadius: 5,
      backgroundColor: colors.skeletonBarLight
    },
    metaBarNarrow: {
      width: "35%",
      height: 12,
      borderRadius: 5,
      backgroundColor: colors.skeletonBarLight
    }
  });
}
