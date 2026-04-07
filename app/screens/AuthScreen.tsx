import { useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { TextField } from "../components/TextField";
import { supabase } from "../services/supabase";
import { useAppTheme, type AppColors } from "../theme";
import type { RootStackParamList } from "../types";

type AuthScreenProps = NativeStackScreenProps<RootStackParamList, "Auth">;

export function AuthScreen(_props: AuthScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isSignUpMode, setIsSignUpMode] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);

  function handleInputFocus(event: any) {
    const target = event.nativeEvent.target;
    if (!target) return;

    setTimeout(() => {
      (scrollViewRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(target, 120, true);
    }, 80);
  }

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter email and password.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      Alert.alert("Login failed", error?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert("Email required", "Enter your email address above, then tap Forgot password.");
      return;
    }

    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (error) {
        throw error;
      }
      Alert.alert(
        "Check your email",
        "If an account exists for that address, a password reset link has been sent."
      );
    } catch (error: any) {
      Alert.alert("Reset failed", error?.message ?? "Could not send reset email. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSignUp() {
    if (!firstName || !lastName || !phone || !email || !password) {
      Alert.alert("Missing info", "Fill in all signup fields.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim()
          }
        }
      });

      if (error) {
        throw error;
      }

      const userId = data.user?.id;
      if (!userId) {
        throw new Error("Could not create user profile.");
      }

      // Supabase returns a user with an empty identities array when the email
      // is already registered (regardless of whether email confirmation is on).
      if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        throw new Error("An account with this email already exists. Please sign in instead.");
      }

      if (data.session) {
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: userId,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim()
          },
          { onConflict: "id" }
        );

        if (profileError) {
          throw profileError;
        }
      }

      if (!data.session) {
        Alert.alert(
          "Confirm your email",
          "Your account was created. Verify your email before logging in."
        );
      }
    } catch (error: any) {
      Alert.alert("Signup failed", error?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title}>AutoIntel</Text>
          <Text style={styles.subtitle}>
            Capture any car and get an AI-powered valuation in seconds.
          </Text>

          {isSignUpMode && (
            <>
              <TextField label="First Name" value={firstName} onChangeText={setFirstName} onFocus={handleInputFocus} />
              <TextField label="Last Name" value={lastName} onChangeText={setLastName} onFocus={handleInputFocus} />
              <TextField
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                onFocus={handleInputFocus}
              />
            </>
          )}

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            onFocus={handleInputFocus}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            onFocus={handleInputFocus}
          />

          {!isSignUpMode && (
            <Pressable
              onPress={handleForgotPassword}
              disabled={forgotLoading}
              style={({ pressed }) => [styles.forgotLink, pressed && styles.forgotLinkPressed]}
            >
              <Text style={styles.forgotLinkText}>
                {forgotLoading ? "Sending…" : "Forgot password?"}
              </Text>
            </Pressable>
          )}

          <PrimaryButton
            title={isSignUpMode ? "Sign Up" : "Login"}
            onPress={isSignUpMode ? handleSignUp : handleLogin}
            loading={loading}
          />

          <PrimaryButton
            title={isSignUpMode ? "Already have an account? Login" : "Need an account? Sign Up"}
            onPress={() => setIsSignUpMode((prev) => !prev)}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    keyboardContainer: {
      flex: 1,
      backgroundColor: colors.background
    },
    scrollContent: {
      flexGrow: 1
    },
    content: {
      flex: 1,
      paddingTop: 72,
      paddingHorizontal: 20,
      paddingBottom: 28,
      gap: 14
    },
    title: {
      fontSize: 36,
      fontWeight: "900",
      color: colors.text
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted,
      marginBottom: 8
    },
    forgotLink: {
      alignSelf: "flex-end",
      paddingVertical: 2,
      marginTop: -4
    },
    forgotLinkPressed: {
      opacity: 0.55
    },
    forgotLinkText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.link
    }
  });
}
