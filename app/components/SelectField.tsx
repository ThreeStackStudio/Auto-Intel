import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAppTheme, type AppColors } from "../theme";

type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  loading = false
}: SelectFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;
  const isDisabled = disabled || loading;

  function handlePick(nextValue: string) {
    onChange(nextValue);
    setVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => {
          if (!isDisabled) setVisible(true);
        }}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.trigger,
          isDisabled && styles.triggerDisabled,
          pressed && !isDisabled && styles.triggerPressed
        ]}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? selectedLabel : placeholder}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text style={styles.chevron}>v</Text>
        )}
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    onPress={() => handlePick(item.value)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      selected && styles.optionSelected,
                      pressed && styles.optionPressed
                    ]}
                  >
                    <Text style={styles.optionText}>{item.label}</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>No options available.</Text>}
            />
            <Pressable onPress={() => setVisible(false)} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      gap: 8
    },
    label: {
      fontSize: 14,
      color: colors.text,
      fontWeight: "600"
    },
    trigger: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 12,
      backgroundColor: colors.inputBackground,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10
    },
    triggerDisabled: {
      opacity: 0.65
    },
    triggerPressed: {
      opacity: 0.8
    },
    valueText: {
      fontSize: 16,
      color: colors.text,
      flexShrink: 1
    },
    placeholderText: {
      fontSize: 16,
      color: colors.placeholder,
      flexShrink: 1
    },
    chevron: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "700"
    },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "center",
      paddingHorizontal: 16
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: "70%",
      padding: 12,
      gap: 10
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text
    },
    optionRow: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 11
    },
    optionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.secondarySurface
    },
    optionPressed: {
      opacity: 0.8
    },
    optionText: {
      fontSize: 15,
      color: colors.text
    },
    emptyText: {
      fontSize: 14,
      color: colors.textMuted,
      paddingVertical: 8
    },
    closeButton: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 42
    },
    closeText: {
      color: colors.text,
      fontWeight: "700",
      fontSize: 14
    }
  });
}
