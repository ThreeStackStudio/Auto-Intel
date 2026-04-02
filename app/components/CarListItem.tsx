import { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme, type AppColors } from "../theme";
import type { CarWithRelations } from "../types";
import { formatCurrency, formatDate } from "../utils/format";

type CarListItemProps = {
  car: CarWithRelations;
  onPress: () => void;
  index?: number;
};

export function CarListItem({ car, onPress, index = 0 }: CarListItemProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mileage =
    car.mileage_km !== null
      ? `${new Intl.NumberFormat("en-US").format(car.mileage_km)} km`
      : "Mileage N/A";

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

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

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {car.year} {car.make} {car.model}
          </Text>
          <Text style={styles.value}>{formatCurrency(car.estimated_value)}</Text>
        </View>
        <Text style={styles.meta}>{mileage}</Text>
        <Text style={styles.meta}>{formatDate(car.created_at)}</Text>
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
      gap: 8
    },
    pressed: {
      opacity: 0.9
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12
    },
    title: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      fontWeight: "700"
    },
    value: {
      fontSize: 16,
      color: colors.success,
      fontWeight: "800"
    },
    meta: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "500"
    }
  });
}
