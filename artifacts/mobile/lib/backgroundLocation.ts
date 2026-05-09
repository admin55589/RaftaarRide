import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";

export const BACKGROUND_LOCATION_TASK = "RAFTAAR_DRIVER_LOCATION";
const BG_CONFIG_KEY = "raftaar_bg_location_config";

export interface BgLocationConfig {
  driverToken: string;
  driverId: number;
  activeRideId: number | null;
}

export async function saveBgLocationConfig(config: BgLocationConfig): Promise<void> {
  await AsyncStorage.setItem(BG_CONFIG_KEY, JSON.stringify(config));
}

export async function clearBgLocationConfig(): Promise<void> {
  await AsyncStorage.removeItem(BG_CONFIG_KEY);
}

export async function startBackgroundLocationTask(): Promise<void> {
  const isRegistered = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (isRegistered) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 8000,
    distanceInterval: 20,
    deferredUpdatesInterval: 5000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "RaftaarRide — Location Active",
      notificationBody: "Driver ka live location track ho raha hai",
      notificationColor: "#F5A623",
    },
    pausesUpdatesAutomatically: false,
  });
}

export async function stopBackgroundLocationTask(): Promise<void> {
  const isRegistered = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  await clearBgLocationConfig();
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
  if (error) return;
  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  if (!locations?.length) return;

  const configStr = await AsyncStorage.getItem(BG_CONFIG_KEY).catch(() => null);
  if (!configStr) return;

  try {
    const config: BgLocationConfig = JSON.parse(configStr);
    const { latitude, longitude } = locations[locations.length - 1].coords;

    await fetch(`${API_BASE}/driver-auth/location`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.driverToken}`,
      },
      body: JSON.stringify({ lat: latitude, lng: longitude }),
    });
  } catch {
  }
});
