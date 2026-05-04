import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDB6UjzLMUfoXJ67cAEDbkRfERIxFLpM7Q";
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.2090 };

interface MapViewProps {
  showRadar?: boolean;
  showRoute?: boolean;
  routeProgress?: number;
  driverLocation?: { lat: number; lng: number } | null;
}

function buildMapHtml(opts: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  showRoute: boolean;
  showRadar: boolean;
  routeProgress: number;
  driverLat: number;
  driverLng: number;
  isDark: boolean;
  hasRealPickup: boolean;
}) {
  const {
    pickupLat, pickupLng,
    dropLat, dropLng,
    showRoute, showRadar,
    routeProgress,
    driverLat, driverLng,
    isDark,
    hasRealPickup,
  } = opts;

  const centerLat = showRoute ? (pickupLat + dropLat) / 2 : pickupLat;
  const centerLng = showRoute ? (pickupLng + dropLng) / 2 : pickupLng;
  const zoom = showRoute ? 12 : 15;

  const darkStyles = JSON.stringify([
    { elementType: "geometry", stylers: [{ color: "#12121A" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#12121A" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
  ]);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden}
    #map{width:100%;height:100%}

    .user-dot-wrap{position:relative;width:22px;height:22px}
    .user-dot{
      width:18px;height:18px;border-radius:50%;
      background:#4A90E2;border:3px solid #fff;
      box-shadow:0 2px 8px rgba(74,144,226,0.7);
      position:absolute;top:2px;left:2px;z-index:2;
    }
    .user-pulse{
      width:44px;height:44px;border-radius:50%;
      background:rgba(74,144,226,0.2);
      border:1.5px solid rgba(74,144,226,0.4);
      position:absolute;top:-11px;left:-11px;
      animation:pulse 2s ease-out infinite;z-index:1;
    }
    @keyframes pulse{
      0%{transform:scale(0.6);opacity:1}
      60%{transform:scale(1.4);opacity:0.3}
      100%{transform:scale(1.8);opacity:0}
    }

    .pickup-pin{
      width:36px;height:36px;border-radius:50%;
      background:#F5A623;border:3px solid #fff;
      box-shadow:0 0 14px rgba(245,166,35,0.8);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;cursor:pointer;
    }
    .drop-pin{
      width:36px;height:36px;border-radius:8px;
      background:#22c55e;border:3px solid #fff;
      box-shadow:0 0 14px rgba(34,197,94,0.8);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;cursor:pointer;
    }
    .driver-pin{
      width:42px;height:42px;border-radius:50%;
      background:#F5A623;border:3px solid #fff;
      box-shadow:0 0 18px rgba(245,166,35,0.9);
      display:flex;align-items:center;justify-content:center;
      font-size:22px;
      animation:driverPulse 1.5s infinite;
    }
    @keyframes driverPulse{
      0%{box-shadow:0 0 0 0 rgba(245,166,35,0.7)}
      70%{box-shadow:0 0 0 14px rgba(245,166,35,0)}
      100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map, directionsRenderer, driverMarker, userMarker;
    var DARK = ${isDark};
    var SHOW_ROUTE = ${showRoute};
    var SHOW_RADAR = ${showRadar};
    var HAS_PICKUP = ${hasRealPickup};
    var pickupLatLng = {lat:${pickupLat},lng:${pickupLng}};
    var dropLatLng   = {lat:${dropLat},lng:${dropLng}};
    var driverLatLng = {lat:${driverLat},lng:${driverLng}};

    function initMap() {
      map = new google.maps.Map(document.getElementById('map'), {
        center: {lat:${centerLat},lng:${centerLng}},
        zoom: ${zoom},
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: DARK ? ${darkStyles} : [],
      });

      if (SHOW_ROUTE) {
        drawRoute();
        addPickupMarker();
        addDropMarker();
        addDriverMarker(driverLatLng);
      } else if (SHOW_RADAR) {
        addDriverMarker(pickupLatLng);
      } else {
        if (HAS_PICKUP) {
          addPickupMarker();
        } else {
          addUserDot(pickupLatLng);
        }
      }

      /* Listen messages from React Native */
      document.addEventListener('message', handleMsg);
      window.addEventListener('message', handleMsg);
    }

    function drawRoute() {
      var ds = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#F5A623',
          strokeWeight: 5,
          strokeOpacity: 0.85,
        }
      });
      directionsRenderer.setMap(map);
      ds.route({
        origin: pickupLatLng,
        destination: dropLatLng,
        travelMode: google.maps.TravelMode.DRIVING,
      }, function(result, status) {
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
        }
      });
    }

    function addPickupMarker() {
      var el = document.createElement('div');
      el.className = 'pickup-pin';
      el.innerHTML = '🟡';
      new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: pickupLatLng,
        content: el,
      });
    }

    function addDropMarker() {
      var el = document.createElement('div');
      el.className = 'drop-pin';
      el.innerHTML = '📍';
      new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: dropLatLng,
        content: el,
      });
    }

    function addDriverMarker(pos) {
      var el = document.createElement('div');
      el.className = 'driver-pin';
      el.innerHTML = '🚗';
      driverMarker = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: pos,
        content: el,
      });
    }

    function addUserDot(pos) {
      var wrap = document.createElement('div');
      wrap.className = 'user-dot-wrap';
      wrap.innerHTML = '<div class="user-pulse"></div><div class="user-dot"></div>';
      userMarker = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: pos,
        content: wrap,
      });
    }

    function handleMsg(e) {
      try {
        var m = JSON.parse(e.data);
        if (m.type === 'userLocation') {
          var pos = {lat: m.lat, lng: m.lng};
          map.panTo(pos);
          if (userMarker) {
            userMarker.position = pos;
          } else {
            addUserDot(pos);
          }
        }
        if (m.type === 'driverLocation' && driverMarker) {
          driverMarker.position = {lat: m.lat, lng: m.lng};
        }
      } catch(err) {}
    }
  </script>
  <script
    src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=marker&callback=initMap&loading=async"
    async defer>
  </script>
</body>
</html>`;
}

export function MapView({
  showRadar = false,
  showRoute = false,
  routeProgress = 0,
  driverLocation = null,
}: MapViewProps) {
  const colors = useColors();
  const { pickupCoords, dropCoords, setPickupCoords } = useApp();
  const webviewRef = useRef<WebView>(null);

  const isDark = colors.background === "#0A0A0F"
    || colors.background.startsWith("#0")
    || colors.background.startsWith("#1");

  const hasRealPickup = pickupCoords !== null;
  const pickupLat = pickupCoords?.lat ?? DEFAULT_CENTER.lat;
  const pickupLng = pickupCoords?.lng ?? DEFAULT_CENTER.lng;
  const dropLat = dropCoords?.lat ?? DEFAULT_CENTER.lat + 0.08;
  const dropLng = dropCoords?.lng ?? DEFAULT_CENTER.lng + 0.06;
  const driverLat = driverLocation?.lat ?? pickupLat;
  const driverLng = driverLocation?.lng ?? pickupLng;

  /* Auto-locate user on mount */
  useEffect(() => {
    let cancelled = false;
    async function locateUser() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          const { status: req } = await Location.requestForegroundPermissionsAsync();
          if (req !== "granted") return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        if (!pickupCoords) {
          setPickupCoords({ lat: latitude, lng: longitude });
        }
        setTimeout(() => {
          webviewRef.current?.postMessage(
            JSON.stringify({ type: "userLocation", lat: latitude, lng: longitude })
          );
        }, 1500);
      } catch (_) {}
    }
    locateUser();
    return () => { cancelled = true; };
  }, []);

  /* Send driver location updates */
  useEffect(() => {
    if (driverLocation && webviewRef.current) {
      webviewRef.current.postMessage(
        JSON.stringify({ type: "driverLocation", lat: driverLocation.lat, lng: driverLocation.lng })
      );
    }
  }, [driverLocation]);

  const html = buildMapHtml({
    pickupLat, pickupLng,
    dropLat, dropLng,
    showRoute, showRadar,
    routeProgress,
    driverLat, driverLng,
    isDark,
    hasRealPickup,
  });

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onMessage={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
