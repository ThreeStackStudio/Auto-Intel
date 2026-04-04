import { useMemo } from "react";
import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";

import { useAppTheme, type AppColors } from "../theme";

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  onFocus?: TextInputProps["onFocus"];
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  onFocus
}: TextFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={onFocus}
      />
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
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      height: 48,
      paddingHorizontal: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.inputBackground
    }
  });
}
