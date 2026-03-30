import { useEffect } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";

import { LoadingOverlay } from "./app/components/LoadingOverlay";
import { useAuth } from "./app/hooks/useAuth";
import { AuthScreen } from "./app/screens/AuthScreen";
import { CameraScreen } from "./app/screens/CameraScreen";
import { HomeScreen } from "./app/screens/HomeScreen";
import { ResultScreen } from "./app/screens/ResultScreen";
import type { RootStackParamList } from "./app/types";
import { installGlobalErrorLogging, logInfo } from "./app/utils/logger";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#EEF4FA"
  }
};

export default function App() {
  const { session, isLoading } = useAuth();

  useEffect(() => {
    installGlobalErrorLogging();
    logInfo("App", "Global error logging enabled.");
  }, []);

  if (isLoading) {
    return <LoadingOverlay message="Loading account..." />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: {
              backgroundColor: "#EEF4FA"
            },
            headerTintColor: "#0A1728",
            headerTitleStyle: {
              fontWeight: "700"
            }
          }}
        >
          {!session ? (
            <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
          ) : (
            <>
              <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Home" }} />
              <Stack.Screen name="Camera" component={CameraScreen} options={{ title: "Scan a Car" }} />
              <Stack.Screen name="Result" component={ResultScreen} options={{ title: "Result" }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
