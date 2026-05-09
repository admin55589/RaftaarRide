import React, { useEffect, useRef, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.2090 };

interface MapViewProps {
  showRadar?: boolean;
  showRoute?: boolean;
  routeProgress?: number;
  driverLocation?: { lat: number; lng: number } | null;
  /** 0 = driver heading to pickup, 1 = driver arrived, 2 = on ride to destination */
  routeStage?: number;
}

function buildMapHtml(opts: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  showRoute: boolean;
  showRadar: boolean;
  isDark: boolean;
  hasRealPickup: boolean;
}) {
  const {
    pickupLat, pickupLng,
    dropLat, dropLng,
    showRoute, showRadar,
    isDark,
    hasRealPickup,
  } = opts;

  const centerLat = showRoute ? (pickupLat + dropLat) / 2 : pickupLat;
  const centerLng = showRoute ? (pickupLng + dropLng) / 2 : pickupLng;
  const zoom = showRoute ? 13 : 15;

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
    html,body{width:100%;height:100%;overflow:hidden;background:#12121A}
    #map{width:100%;height:100%}

    /* Hide ALL Google Maps error overlays */
    .gm-err-container,.gm-err-content,.gm-err-message,
    .gm-err-icon,.gm-err-title,.gm-err-autocomplete,
    div[class*="gm-err"],div[class*="dismissButton"],
    .dismissButton,.gm-style-cc,
    a[href*="maps.google"],
    div[style*="z-index: 1000000"]{display:none!important}
    #map > div > div:not([style*="overflow: hidden"]){pointer-events:none}

    /* Fallback shown when Maps API fails */
    #map-fallback{
      display:none;position:absolute;inset:0;
      background:linear-gradient(160deg,#12121A 0%,#1a2230 50%,#12121A 100%);
      flex-direction:column;align-items:center;justify-content:center;
      font-family:-apple-system,sans-serif;z-index:999;
    }
    #map-fallback.show{display:flex}
    .fb-radar{
      width:160px;height:160px;border-radius:50%;
      border:2px solid rgba(245,166,35,0.3);
      position:relative;display:flex;align-items:center;justify-content:center;
      margin-bottom:20px;
    }
    .fb-radar::before{content:'';position:absolute;width:110px;height:110px;border-radius:50%;border:2px solid rgba(245,166,35,0.2)}
    .fb-radar::after{content:'';position:absolute;width:60px;height:60px;border-radius:50%;border:2px solid rgba(245,166,35,0.15)}
    .fb-ping{width:160px;height:160px;border-radius:50%;border:2px solid rgba(245,166,35,0.5);position:absolute;animation:fbPing 2s ease-out infinite}
    @keyframes fbPing{0%{transform:scale(0.3);opacity:1}100%{transform:scale(1.1);opacity:0}}
    .fb-icon{font-size:36px;z-index:1}
    .fb-title{color:#F5A623;font-size:15px;font-weight:700;margin-bottom:6px;letter-spacing:0.3px}
    .fb-sub{color:rgba(255,255,255,0.4);font-size:12px;text-align:center;max-width:200px;line-height:1.5}

    .user-dot-wrap{position:relative;width:22px;height:22px}
    .user-dot{width:18px;height:18px;border-radius:50%;background:#4A90E2;border:3px solid #fff;box-shadow:0 2px 8px rgba(74,144,226,0.7);position:absolute;top:2px;left:2px;z-index:2}
    .user-pulse{width:44px;height:44px;border-radius:50%;background:rgba(74,144,226,0.2);border:1.5px solid rgba(74,144,226,0.4);position:absolute;top:-11px;left:-11px;animation:pulse 2s ease-out infinite;z-index:1}
    @keyframes pulse{0%{transform:scale(0.6);opacity:1}60%{transform:scale(1.4);opacity:0.3}100%{transform:scale(1.8);opacity:0}}

    .pickup-pin{width:36px;height:36px;border-radius:50%;background:#F5A623;border:3px solid #fff;box-shadow:0 0 14px rgba(245,166,35,0.8);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer}
    .drop-pin{width:36px;height:36px;border-radius:8px;background:#22c55e;border:3px solid #fff;box-shadow:0 0 14px rgba(34,197,94,0.8);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer}
    .driver-pin{width:42px;height:42px;border-radius:50%;background:#F5A623;border:3px solid #fff;box-shadow:0 0 18px rgba(245,166,35,0.9);display:flex;align-items:center;justify-content:center;font-size:22px;animation:driverPulse 1.5s infinite}
    @keyframes driverPulse{0%{box-shadow:0 0 0 0 rgba(245,166,35,0.7)}70%{box-shadow:0 0 0 14px rgba(245,166,35,0)}100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}}
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="map-fallback">
    <div class="fb-radar"><div class="fb-ping"></div><div class="fb-icon">📍</div></div>
    <div class="fb-title">Location Tracking Active</div>
    <div class="fb-sub">GPS signal lock ho raha hai…</div>
  </div>
  <script>
    window.gm_authFailure = function() {
      document.getElementById('map-fallback').classList.add('show');
      document.getElementById('map').style.display = 'none';
    };

    var _obs = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          var el = node;
          var cls = el.className || '';
          var txt = el.innerText || el.textContent || '';
          if (
            cls.indexOf('gm-err') !== -1 ||
            cls.indexOf('dismissButton') !== -1 ||
            txt.indexOf("can't load Google Maps") !== -1 ||
            txt.indexOf("Do you own this website") !== -1
          ) {
            el.style.setProperty('display','none','important');
            el.remove();
            var fb = document.getElementById('map-fallback');
            if (fb) fb.classList.add('show');
            var mp = document.getElementById('map');
            if (mp) mp.style.display = 'none';
          }
          var children = el.querySelectorAll ? el.querySelectorAll('[class*="gm-err"]') : [];
          children.forEach(function(c) { c.style.setProperty('display','none','important'); });
        });
      });
    });
    _obs.observe(document.body, { childList: true, subtree: true });

    var map, directionsRenderer, driverMarker, userMarker;
    var DARK = ${isDark};
    var SHOW_ROUTE = ${showRoute};
    var SHOW_RADAR = ${showRadar};
    var HAS_PICKUP = ${hasRealPickup};

    /* Coordinates — driver starts at pickup, gets updated via postMessage */
    var pickupLatLng = {lat:${pickupLat},lng:${pickupLng}};
    var dropLatLng   = {lat:${dropLat},lng:${dropLng}};
    var driverLatLng = {lat:${pickupLat},lng:${pickupLng}};

    /* Route stage: 0 = driver→pickup, 1 = arrived (no route), 2 = driver→destination */
    var routeStage = 0;
    var lastRoutedPos = null;
    var isRouting = false;
    var REROUTE_DIST_M = 150; /* reroute only if driver moved ≥150m */

    function haversineM(a, b) {
      var R = 6371000;
      var dLat = (b.lat - a.lat) * Math.PI / 180;
      var dLng = (b.lng - a.lng) * Math.PI / 180;
      var s = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*
              Math.sin(dLng/2)*Math.sin(dLng/2);
      return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
    }

    function fitBounds(a, b) {
      if (!map) return;
      var bounds = new google.maps.LatLngBounds();
      bounds.extend(a);
      bounds.extend(b);
      map.fitBounds(bounds, {top:80, bottom:260, left:40, right:40});
    }

    function drawRoute(fromPos, toPos) {
      if (isRouting) return;
      isRouting = true;
      var ds = new google.maps.DirectionsService();
      if (!directionsRenderer) {
        directionsRenderer = new google.maps.DirectionsRenderer({
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#F5A623',
            strokeWeight: 6,
            strokeOpacity: 0.9,
          },
          preserveViewport: true,
        });
        directionsRenderer.setMap(map);
      }
      ds.route({
        origin: fromPos,
        destination: toPos,
        travelMode: google.maps.TravelMode.DRIVING,
      }, function(result, status) {
        isRouting = false;
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
          lastRoutedPos = {lat: fromPos.lat, lng: fromPos.lng};
          fitBounds(fromPos, toPos);
          try {
            var leg = result.routes[0].legs[0];
            var msg = JSON.stringify({
              type: 'routeInfo',
              distanceM: leg.distance.value,
              durationS: leg.duration.value,
            });
            if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
            else window.postMessage(msg, '*');
          } catch(e) {}
        }
      });
    }

    function clearRoute() {
      if (directionsRenderer) {
        directionsRenderer.setMap(null);
        directionsRenderer = null;
        lastRoutedPos = null;
      }
    }

    function maybeReroute() {
      if (!SHOW_ROUTE) return;
      if (routeStage === 1) { clearRoute(); return; }
      if (isRouting) return;

      /* Only reroute if driver moved enough from last routed position */
      if (lastRoutedPos) {
        var moved = haversineM(lastRoutedPos, driverLatLng);
        if (moved < REROUTE_DIST_M) return;
      }

      var dest = routeStage === 2 ? dropLatLng : pickupLatLng;
      drawRoute(driverLatLng, dest);
    }

    function initRoute() {
      if (!SHOW_ROUTE) return;
      if (routeStage === 1) return;
      var dest = routeStage === 2 ? dropLatLng : pickupLatLng;
      /* Wait for a real driver location via postMessage before drawing */
      /* Initial draw uses current driverLatLng (= pickup by default) — will update on first msg */
      drawRoute(driverLatLng, dest);
    }

    function initMap() {
      map = new google.maps.Map(document.getElementById('map'), {
        center: {lat:${centerLat},lng:${centerLng}},
        zoom: ${zoom},
        disableDefaultUI: true,
        gestureHandling: 'greedy',
        styles: DARK ? ${darkStyles} : [],
        mapId: 'raftaar_map',
      });

      if (SHOW_ROUTE) {
        addPickupMarker();
        addDropMarker();
        addDriverMarker(driverLatLng);
        initRoute();
      } else if (SHOW_RADAR) {
        addDriverMarker(pickupLatLng);
      } else {
        if (HAS_PICKUP) {
          addPickupMarker();
        } else {
          addUserDot(pickupLatLng);
        }
      }

      document.addEventListener('message', handleMsg);
      window.addEventListener('message', handleMsg);
    }

    function addPickupMarker() {
      var el = document.createElement('div');
      el.className = 'pickup-pin';
      el.innerHTML = '🟡';
      new google.maps.marker.AdvancedMarkerElement({ map: map, position: pickupLatLng, content: el });
    }

    function addDropMarker() {
      var el = document.createElement('div');
      el.className = 'drop-pin';
      el.innerHTML = '📍';
      new google.maps.marker.AdvancedMarkerElement({ map: map, position: dropLatLng, content: el });
    }

    function addDriverMarker(pos) {
      var el = document.createElement('div');
      el.className = 'driver-pin';
      el.innerHTML = '🚗';
      driverMarker = new google.maps.marker.AdvancedMarkerElement({ map: map, position: pos, content: el });
    }

    function addUserDot(pos) {
      var wrap = document.createElement('div');
      wrap.className = 'user-dot-wrap';
      wrap.innerHTML = '<div class="user-pulse"></div><div class="user-dot"></div>';
      userMarker = new google.maps.marker.AdvancedMarkerElement({ map: map, position: pos, content: wrap });
    }

    function handleMsg(e) {
      try {
        var m = JSON.parse(e.data);

        if (m.type === 'driverLocation') {
          driverLatLng = {lat: m.lat, lng: m.lng};
          if (driverMarker) driverMarker.position = driverLatLng;
          /* Smooth pan to keep driver visible */
          if (map && SHOW_ROUTE && routeStage !== 1) {
            maybeReroute();
          } else if (map && !SHOW_ROUTE) {
            map.panTo(driverLatLng);
          }
        }

        if (m.type === 'stageChange') {
          routeStage = m.stage;
          lastRoutedPos = null; /* force reroute on stage change */
          if (SHOW_ROUTE) {
            if (routeStage === 1) {
              clearRoute();
              /* Just show pickup + driver markers, pan to driver */
              if (map) map.panTo(driverLatLng);
            } else {
              maybeReroute();
            }
          }
        }

        if (m.type === 'userLocation') {
          var pos = {lat: m.lat, lng: m.lng};
          if (!SHOW_ROUTE) map.panTo(pos);
          if (userMarker) {
            userMarker.position = pos;
          } else {
            addUserDot(pos);
          }
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
  routeStage = 0,
}: MapViewProps) {
  const colors = useColors();
  const { pickupCoords, dropCoords, setPickupCoords, setEstimatedDistanceKm, setEstimatedTime } = useApp();
  const webviewRef = useRef<WebView>(null);

  const isDark = colors.background === "#0A0A0F"
    || colors.background.startsWith("#0")
    || colors.background.startsWith("#1");

  const hasRealPickup = pickupCoords !== null;
  const pickupLat = pickupCoords?.lat ?? DEFAULT_CENTER.lat;
  const pickupLng = pickupCoords?.lng ?? DEFAULT_CENTER.lng;
  const dropLat = dropCoords?.lat ?? DEFAULT_CENTER.lat + 0.08;
  const dropLng = dropCoords?.lng ?? DEFAULT_CENTER.lng + 0.06;

  /* Build HTML only when static/layout props change — NOT on driver location updates */
  const html = useMemo(() => buildMapHtml({
    pickupLat, pickupLng,
    dropLat, dropLng,
    showRoute, showRadar,
    isDark,
    hasRealPickup,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pickupLat, pickupLng, dropLat, dropLng, showRoute, showRadar, isDark, hasRealPickup]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Push driver location to WebView — no HTML rebuild needed */
  useEffect(() => {
    if (driverLocation && webviewRef.current) {
      webviewRef.current.postMessage(
        JSON.stringify({ type: "driverLocation", lat: driverLocation.lat, lng: driverLocation.lng })
      );
    }
  }, [driverLocation]);

  /* Push stage change to WebView — updates route destination without map reload */
  const prevStageRef = useRef<number>(0);
  useEffect(() => {
    if (routeStage !== prevStageRef.current && webviewRef.current) {
      prevStageRef.current = routeStage;
      webviewRef.current.postMessage(
        JSON.stringify({ type: "stageChange", stage: routeStage })
      );
    }
  }, [routeStage]);

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
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { type: string; distanceM?: number; durationS?: number };
            if (msg.type === "routeInfo" && msg.distanceM && msg.durationS) {
              const distKm = parseFloat((msg.distanceM / 1000).toFixed(1));
              const timeMin = Math.ceil(msg.durationS / 60);
              setEstimatedDistanceKm(distKm);
              setEstimatedTime(timeMin);
            }
          } catch {}
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
