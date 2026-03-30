import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { CarListItem } from "../components/CarListItem";
import { PrimaryButton } from "../components/PrimaryButton";
import { fetchUserCars } from "../services/carService";
import { supabase } from "../services/supabase";
import type { CarWithRelations, RootStackParamList } from "../types";

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const [history, setHistory] = useState<CarWithRelations[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const cars = await fetchUserCars();
      setHistory(cars);
    } catch (error: any) {
      Alert.alert("Could not load history", error?.message ?? "Please try again.");
    } finally {
      setLoading(false);
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>AutoIntel</Text>
        <Text style={styles.subtitle}>AI car valuations from your camera.</Text>

        <PrimaryButton title="Scan a Car" onPress={() => navigation.navigate("Camera")} />
        <PrimaryButton title="Logout" onPress={handleLogout} variant="secondary" />

        <Text style={styles.sectionTitle}>Previous Analyses</Text>
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadHistory} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No scans yet</Text>
              <Text style={styles.emptySubtitle}>Scan your first car to start building history.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <CarListItem car={item} onPress={() => navigation.navigate("Result", { car: item })} />
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF4FA"
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
    color: "#0A1728"
  },
  subtitle: {
    fontSize: 15,
    color: "#38536F",
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0A1728",
    marginTop: 8
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
    color: "#27415E",
    fontWeight: "700"
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#5A718B"
  }
});

