import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CarWithRelations } from "../types";
import { formatCurrency, formatDate } from "../utils/format";

type CarListItemProps = {
  car: CarWithRelations;
  onPress: () => void;
};

export function CarListItem({ car, onPress }: CarListItemProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {car.make} {car.model}
        </Text>
        <Text style={styles.value}>{formatCurrency(car.estimated_value)}</Text>
      </View>
      <Text style={styles.meta}>{formatDate(car.created_at)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DAE3EF",
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
    color: "#0A1728",
    fontWeight: "700"
  },
  value: {
    fontSize: 16,
    color: "#0B5D1E",
    fontWeight: "800"
  },
  meta: {
    fontSize: 13,
    color: "#496582",
    fontWeight: "500"
  }
});

