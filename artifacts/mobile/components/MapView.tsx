import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

const MAPBOX_TOKEN = "pk.eyJ1IjoicmFmdGFhcnJpZGUxNTY2IiwiYSI6ImNtbzdscTF3MzA4cTkycHM2czFmbjVocXcifQ.x7rpAJ_b9THRrw_wg76YuQ";
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
}) {
  const {
    pickupLat, pickupLng,
    dropLat, dropLng,
    showRoute, showRadar,
    routeProgress,
    driverLat, driverLng,
    isDark,
  } = opts;

  const style = isDark
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/streets-v12";

  const centerLat = showRoute ? (pickupLat + dropLat) / 2 : pickupLat;
  const centerLng = showRoute ? (pickupLng + dropLng) / 2 : pickupLng;
  const zoom = showRoute ? 11 : 13;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.css" rel="stylesheet"/>
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:100vw;height:100vh;overflow:hidden}
    #map{width:100%;height:100%}
    .pickup-marker{
      width:34px;height:34px;border-radius:50%;
      background:#F5A623;border:3px solid #fff;
      box-shadow:0 0 12px rgba(245,166,35,0.8);
      display:flex;align-items:center;justify-content:center;font-size:14px;
    }
    .drop-marker{
      width:34px;height:34px;border-radius:8px;
      background:#22c55e;border:3px solid #fff;
      box-shadow:0 0 12px rgba(34,197,94,0.8);
      display:flex;align-items:center;justify-content:center;font-size:14px;
    }
    .driver-marker{
      width:40px;height:40px;border-radius:50%;
      background:#F5A623;border:3px solid #fff;
      box-shadow:0 0 16px rgba(245,166,35,0.9);
      display:flex;align-items:center;justify-content:center;font-size:20px;
      animation:pulse 1.5s infinite;
    }
    @keyframes pulse{
      0%{box-shadow:0 0 0 0 rgba(245,166,35,0.7)}
      70%{box-shadow:0 0 0 14px rgba(245,166,35,0)}
      100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    mapboxgl.accessToken='${MAPBOX_TOKEN}';
    const map=new mapboxgl.Map({
      container:'map',
      style:'${style}',
      center:[${centerLng},${centerLat}],
      zoom:${zoom},
      attributionControl:false,
      logoPosition:'bottom-left'
    });

    map.on('load',function(){

      ${showRoute ? `
        const pickupLngLat=[${pickupLng},${pickupLat}];
        const dropLngLat=[${dropLng},${dropLat}];

        fetch('https://api.mapbox.com/directions/v5/mapbox/driving/'+
          pickupLngLat[0]+','+pickupLngLat[1]+';'+
          dropLngLat[0]+','+dropLngLat[1]+
          '?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}')
        .then(r=>r.json())
        .then(data=>{
          if(!data.routes||!data.routes.length)return;
          const coords=data.routes[0].geometry.coordinates;
          const totalPts=coords.length;
          const donePts=Math.max(1,Math.floor(totalPts*${routeProgress}));

          map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
          map.addLayer({id:'route-bg',type:'line',source:'route',paint:{'line-color':'rgba(245,166,35,0.22)','line-width':7,'line-cap':'round','line-join':'round'}});

          if(${routeProgress}>0){
            map.addSource('route-done',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords.slice(0,donePts+1)}}});
            map.addLayer({id:'route-done',type:'line',source:'route-done',paint:{'line-color':'#22c55e','line-width':7,'line-cap':'round','line-join':'round'}});
          }
        }).catch(e=>console.warn(e));

        const pEl=document.createElement('div');pEl.className='pickup-marker';pEl.innerHTML='🟡';
        new mapboxgl.Marker({element:pEl}).setLngLat(pickupLngLat).addTo(map);

        const dEl=document.createElement('div');dEl.className='drop-marker';dEl.innerHTML='📍';
        new mapboxgl.Marker({element:dEl}).setLngLat(dropLngLat).addTo(map);

        const carEl=document.createElement('div');carEl.className='driver-marker';carEl.innerHTML='🚗';
        const driverMarker=new mapboxgl.Marker({element:carEl}).setLngLat([${driverLng},${driverLat}]).addTo(map);

        document.addEventListener('message',function(e){
          try{const m=JSON.parse(e.data);if(m.type==='driverLocation'){driverMarker.setLngLat([m.lng,m.lat]);}}catch(err){}
        });
        window.addEventListener('message',function(e){
          try{const m=JSON.parse(e.data);if(m.type==='driverLocation'){driverMarker.setLngLat([m.lng,m.lat]);}}catch(err){}
        });
      ` : ''}

      ${showRadar && !showRoute ? `
        const radarEl=document.createElement('div');radarEl.className='driver-marker';radarEl.innerHTML='📍';
        new mapboxgl.Marker({element:radarEl}).setLngLat([${pickupLng},${pickupLat}]).addTo(map);
      ` : ''}

      ${!showRoute && !showRadar ? `
        const pinEl=document.createElement('div');pinEl.className='pickup-marker';pinEl.innerHTML='📍';
        new mapboxgl.Marker({element:pinEl}).setLngLat([${centerLng},${centerLat}]).addTo(map);
      ` : ''}

    });
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
  const { pickupCoords, dropCoords } = useApp();
  const webviewRef = useRef<WebView>(null);

  const isDark = colors.background === "#0A0A0F"
    || colors.background.startsWith("#0")
    || colors.background.startsWith("#1");

  const pickupLat = pickupCoords?.lat ?? DEFAULT_CENTER.lat;
  const pickupLng = pickupCoords?.lng ?? DEFAULT_CENTER.lng;
  const dropLat = dropCoords?.lat ?? DEFAULT_CENTER.lat + 0.08;
  const dropLng = dropCoords?.lng ?? DEFAULT_CENTER.lng + 0.06;
  const driverLat = driverLocation?.lat ?? pickupLat;
  const driverLng = driverLocation?.lng ?? pickupLng;

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
