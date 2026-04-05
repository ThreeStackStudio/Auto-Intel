import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { CarListItem } from "../components/CarListItem";
import { PrimaryButton } from "../components/PrimaryButton";
import { SkeletonCard } from "../components/SkeletonCard";
import { SwipeToDeleteRow } from "../components/SwipeToDeleteRow";
import { deleteCarAnalysis, fetchUserCars } from "../services/carService";
import { supabase } from "../services/supabase";
import { useAppTheme, type AppColors } from "../theme";
import type { CarWithRelations, RootStackParamList } from "../types";

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [history, setHistory] = useState<CarWithRelations[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredHistory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return history;
    return history.filter((car) =>
      `${car.year} ${car.make} ${car.model}`.toLowerCase().includes(query)
    );
  }, [history, searchQuery]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const cars = await fetchUserCars();
      setHistory(cars);
    } catch (error: any) {
      Alert.alert("Could not load history", error?.message ?? "Please try again.");
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory])
  );

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Sign out failed", error.message);
    }
  }

  function promptDeleteAnalysis(car: CarWithRelations) {
    Alert.alert(
      "Delete analysis?",
      `${car.year} ${car.make} ${car.model} will be permanently removed from your history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void handleDeleteAnalysis(car.id);
          }
        }
      ]
    );
  }

  async function handleDeleteAnalysis(carId: string) {
    setDeletingId(carId);
    try {
      await deleteCarAnalysis(carId);
      setHistory((prev) => prev.filter((car) => car.id !== carId));
    } catch (error: any) {
      Alert.alert("Delete failed", error?.message ?? "Could not delete this analysis.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>AutoIntel</Text>
        <Text style={styles.subtitle}>AI car valuations from your camera.</Text>

        <PrimaryButton title="Scan a Car" onPress={() => navigation.navigate("Camera")} />
        <PrimaryButton title="Logout" onPress={handleLogout} variant="secondary" />

        <Text style={styles.sectionTitle}>Previous Analyses</Text>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by make, model, or year…"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {initialLoad && loading ? (
          <View style={styles.listContent}>
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </View>
        ) : (
          <FlatList
            data={filteredHistory}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadHistory} tintColor={colors.primary} colors={[colors.primary]} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {searchQuery.trim() ? "No results" : "No scans yet"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery.trim()
                    ? `No scans matching "${searchQuery.trim()}".`
                    : "Scan your first car to start building history."}
                </Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <SwipeToDeleteRow onDelete={() => promptDeleteAnalysis(item)} disabled={Boolean(deletingId)}>
                <CarListItem car={item} index={index} onPress={() => navigation.navigate("Result", { car: item })} />
              </SwipeToDeleteRow>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 12
    },
    title: {
      fontSize: 30,
      fontWeight: "900",
      color: colors.text
    },
    subtitle: {
      fontSize: 15,
      color: colors.textMuted,
      marginBottom: 8
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text,
      marginTop: 8
    },
    searchInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: colors.text
    },
    listContent: {
      paddingBottom: 24,
      gap: 10
    },
    emptyState: {
      paddingVertical: 40,
      alignItems: "center",
      gap: 8
    },
    emptyTitle: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: "700"
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textSubtle
    }
  });
}

