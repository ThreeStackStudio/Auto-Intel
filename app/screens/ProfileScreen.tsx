import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { PrimaryButton } from "../components/PrimaryButton";
import { TextField } from "../components/TextField";
import {
  changePasswordWithVerification,
  deleteMyAccount,
  fetchMyProfile,
  updateMyPhone,
  type UserProfile
} from "../services/accountService";
import { useAppTheme, type AppColors } from "../theme";
import type { RootStackParamList } from "../types";
import { formatDate } from "../utils/format";

type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, "Profile">;

export function ProfileScreen(_props: ProfileScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [updatingPhone, setUpdatingPhone] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);

  function handleInputFocus(event: any) {
    const target = event.nativeEvent.target;
    if (!target) return;

    setTimeout(() => {
      (scrollViewRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(target, 120, true);
    }, 80);
  }

  function handleDeletePasswordFocus(event: any) {
    handleInputFocus(event);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 180);
  }

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const next = await fetchMyProfile();
      setProfile(next);
      setPhoneDraft(next.phone ?? "");
    } catch (error: any) {
      Alert.alert("Could not load profile", error?.message ?? "Please try again.");
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert("Missing info", "Fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Weak password", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert("Mismatch", "New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert("No change", "New password must be different from current password.");
      return;
    }

    setUpdatingPassword(true);
    try {
      await changePasswordWithVerification(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      Alert.alert("Password updated", "Your password was changed successfully.");
    } catch (error: any) {
      Alert.alert("Password change failed", error?.message ?? "Please try again.");
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleUpdatePhone() {
    const nextPhone = phoneDraft.trim();
    if (!nextPhone) {
      Alert.alert("Missing phone", "Enter a phone number.");
      return;
    }

    const currentPhone = profile?.phone.trim() ?? "";
    if (nextPhone === currentPhone) {
      Alert.alert("No change", "Your phone number is already up to date.");
      return;
    }

    setUpdatingPhone(true);
    try {
      await updateMyPhone(nextPhone);
      setProfile((prev) => (prev ? { ...prev, phone: nextPhone } : prev));
      setPhoneDraft(nextPhone);
      Alert.alert("Phone updated", "Your phone number was updated successfully.");
    } catch (error: any) {
      Alert.alert("Update failed", error?.message ?? "Could not update your phone number.");
    } finally {
      setUpdatingPhone(false);
    }
  }

  function handleDeleteAccountPrompt() {
    if (!deletePassword) {
      Alert.alert("Missing password", "Enter your current password to delete your account.");
      return;
    }

    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, all analyses, and all stored photos. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            void handleDeleteAccount();
          }
        }
      ]
    );
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      await deleteMyAccount(deletePassword);
      setDeletePassword("");
      Alert.alert("Account deleted", "Your account and all linked data have been removed.");
    } catch (error: any) {
      Alert.alert("Delete failed", error?.message ?? "Could not delete your account.");
    } finally {
      setDeletingAccount(false);
    }
  }

  const fullName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || "Not set";
  const joinedDate = profile?.createdAt ? formatDate(profile.createdAt) : "Unknown";

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
          <Text style={styles.title}>Profile</Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Account Details</Text>
            {loadingProfile ? (
              <Text style={styles.metaValue}>Loading profile...</Text>
            ) : (
              <>
                <Text style={styles.metaLabel}>Name</Text>
                <Text style={styles.metaValue}>{fullName}</Text>
                <Text style={styles.metaLabel}>Email</Text>
                <Text style={styles.metaValue}>{profile?.email || "Unknown"}</Text>
                <Text style={styles.metaLabel}>Phone</Text>
                <Text style={styles.metaValue}>{profile?.phone || "Not set"}</Text>
                <Text style={styles.metaLabel}>Joined</Text>
                <Text style={styles.metaValue}>{joinedDate}</Text>
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Update Phone Number</Text>
            <TextField
              label="Phone"
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              keyboardType="phone-pad"
              autoCapitalize="none"
              onFocus={handleInputFocus}
            />
            <PrimaryButton
              title="Save Phone Number"
              onPress={handleUpdatePhone}
              loading={updatingPhone}
              disabled={updatingPassword || deletingAccount || loadingProfile}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Change Password</Text>
            <TextField
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
              onFocus={handleInputFocus}
            />
            <TextField
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              onFocus={handleInputFocus}
            />
            <TextField
              label="Confirm New Password"
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry
              autoCapitalize="none"
              onFocus={handleInputFocus}
            />
            <PrimaryButton
              title="Update Password"
              onPress={handleChangePassword}
              loading={updatingPassword}
              disabled={deletingAccount || updatingPhone}
            />
          </View>

          <View style={[styles.card, styles.dangerCard]}>
            <Text style={styles.sectionTitle}>Delete Account</Text>
            <Text style={styles.dangerText}>
              Enter your current password to permanently delete your account and all related data.
            </Text>
            <TextField
              label="Current Password"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoCapitalize="none"
              onFocus={handleDeletePasswordFocus}
            />
            <PrimaryButton
              title="Delete Account"
              onPress={handleDeleteAccountPrompt}
              loading={deletingAccount}
              disabled={updatingPassword || updatingPhone}
            />
          </View>
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
      paddingTop: 16,
      paddingHorizontal: 16,
      paddingBottom: 28,
      gap: 14
    },
    title: {
      fontSize: 30,
      fontWeight: "900",
      color: colors.text
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      gap: 10
    },
    dangerCard: {
      borderColor: colors.danger
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text
    },
    metaLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSubtle,
      textTransform: "uppercase",
      letterSpacing: 0.3
    },
    metaValue: {
      fontSize: 15,
      color: colors.text,
      marginBottom: 6
    },
    dangerText: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted
    }
  });
}
