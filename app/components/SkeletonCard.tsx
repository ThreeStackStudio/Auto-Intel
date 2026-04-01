import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export function SkeletonCard() {
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DAE3EF",
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  titleBar: {
    flex: 1,
    height: 16,
    borderRadius: 6,
    backgroundColor: "#C5D5E8",
  },
  valueBar: {
    width: 72,
    height: 16,
    borderRadius: 6,
    backgroundColor: "#B8CCDE",
  },
  metaBarWide: {
    width: "55%",
    height: 12,
    borderRadius: 5,
    backgroundColor: "#D4E3EF",
  },
  metaBarNarrow: {
    width: "35%",
    height: 12,
    borderRadius: 5,
    backgroundColor: "#D4E3EF",
  },
});
