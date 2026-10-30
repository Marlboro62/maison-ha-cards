/* Faux Home Assistant de la démo : entités, registre, pièces et étages (valeurs fictives). */
(() => {
  const H = 3600e3, D = 86400e3;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const img = (bg, t) => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#222"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="160" y="100" font-size="26" text-anchor="middle" fill="#fff" font-family="Arial">${t}</text></svg>`);

  window.makeHass = (o = {}) => {
    const st = {}, ent = {}, devices = {};
    const s = (id, state, attrs = {}, reg = {}) => {
      st[id] = { entity_id: id, state: String(state), attributes: attrs, last_changed: reg.lc || iso(-2 * H), last_updated: reg.lc || iso(-2 * H) };
      ent[id] = { entity_id: id, platform: reg.p || "demo", translation_key: reg.k || null, device_id: reg.dev || null, area_id: reg.area || null, entity_category: reg.cat || null };
    };
    const tempoNow = o.tempo || "Bleu";
    // --- pastilles
    s("sensor.rte_tempo_couleur_actuelle", tempoNow, { friendly_name: "Couleur Tempo actuelle" }, { p: "rte_tempo" });
    s("sensor.rte_tempo_prochaine_couleur", o.tempoNext || "Blanc", {}, { p: "rte_tempo" });
    s("cover.portail2", o.gate || "closed", { device_class: "gate", friendly_name: "Portail" }, { p: "zwave_js", area: "jardin" });
    s("binary_sensor.verrousoussol_contact", o.garageOpen ? "on" : "off", { device_class: "door", friendly_name: "Verrou sous-sol" }, { area: "atelier" });
    s("sensor.count_nombre_ouvrants_ouverts", o.openings ?? 2, {});
    s("sensor.rex_activity_time", 35, { unit_of_measurement: "min" });
    s("sensor.rex_daily_goal", 60, { unit_of_measurement: "min" });
    s("sensor.mokka_battery_level", 72, { unit_of_measurement: "%", device_class: "battery", friendly_name: "Mokka batterie" }, { p: "stellantis" });
    s("sensor.mokka_charging_status", "InProgress", {});
    s("sensor.battery", o.tesla ?? 54, { unit_of_measurement: "%", device_class: "battery", friendly_name: "Tesla batterie" }, { p: "tesla_custom", k: "battery_level", dev: "tesla" });
    s("binary_sensor.charging", o.charging === false ? "off" : "on", { friendly_name: "Tesla en charge" }, { p: "tesla_custom", dev: "tesla" });
    s("binary_sensor.charger", "on", { friendly_name: "Tesla câble" }, { p: "tesla_custom", dev: "tesla" });
    s("sensor.charger_power", 7.2, { unit_of_measurement: "kW" }, { p: "tesla_custom", dev: "tesla" });
    s("sensor.range", 262, { unit_of_measurement: "km" }, { p: "tesla_custom", dev: "tesla" });
    s("sensor.odometer", 48210, { unit_of_measurement: "km" }, { p: "tesla_custom", dev: "tesla" });
    s("climate.hvac_climate_system", "heat_cool", { temperature: 21, current_temperature: 24.5, target_temp_step: 0.5, friendly_name: "Climatisation" }, { p: "tesla_custom", dev: "tesla" });
    s("lock.tesla_door_lock", "locked", { friendly_name: "Portes" }, { p: "tesla_custom", dev: "tesla" });
    s("device_tracker.tesla_location", "home", {}, { p: "tesla_custom", dev: "tesla" });
    s("sensor.jardin_switch_borne_electric_consumption_w", 7200, { unit_of_measurement: "W" });
    s("switch.jardin_switch_borne", "on", { friendly_name: "Borne" });
    s("sensor.jours_granules_restants", 45, { unit_of_measurement: "j" });
    s("sensor.jours_d_hiver_restants", 40, {});
    s("input_select.mode_saison", o.saison || "hiver", { options: ["été", "hiver"], friendly_name: "Saison" });
    s("input_number.granule_restant", 900, { unit_of_measurement: "kg" });
    [42, 0, 75, 18].forEach((v, i) => s(`sensor.douches_douche${i + 1}`, v, { unit_of_measurement: "L" }));
    // imprimante Bambu
    const pre = "bambu_p1p";
    s(`sensor.${pre}_current_stage`, o.printing === false ? "idle" : "printing", {}, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_print_status`, o.printing === false ? "finish" : "running", {}, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_remaining_time`, 83, { unit_of_measurement: "min" }, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_print_progress`, 62, { unit_of_measurement: "%" }, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_bed_temperature`, 55, { unit_of_measurement: "°C" }, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_target_bed_temperature`, 55, { unit_of_measurement: "°C" }, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_nozzle_temperature`, 219, { unit_of_measurement: "°C" }, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_target_nozzle_temperature`, 220, { unit_of_measurement: "°C" }, { p: "bambu_lab", dev: "p1p" });
    s(`sensor.${pre}_gcode_filename`, "support_casque.gcode", {}, { p: "bambu_lab", dev: "p1p" });
    for (const b of ["pause_printing", "resume_printing", "stop_printing"]) s(`button.${pre}_${b}`, "unknown", {}, { p: "bambu_lab", dev: "p1p" });
    s("camera.camerabambu_clear", "idle", { entity_picture: img("#3a6b4f", "Caméra Bambu") }, { p: "generic" });
    // machines, robot…
    s("sensor.lave_linge_remaining_time", o.washer || "0:42:00", {});
    s("input_boolean.lavelingefini", "off", {});
    s("input_select.cuisine_lavevaisselle", "on", { options: ["off", "on", "fini"] });
    s("sensor.temps_restant_lavevaisselle", "1:10", {});
    s("vacuum.alfred", o.vacuum || "cleaning", { battery_level: 80, fan_speed: "Standard", fan_speed_list: ["Silencieux", "Standard", "Fort", "Turbo"], supported_features: 16383, friendly_name: "Alfred", status: "Nettoyage" }, { p: "roborock", dev: "alfred", area: "cuisine" });
    s("sensor.cuisine_alfred_cleaning_area", 24, { unit_of_measurement: "m²" }, { p: "roborock", dev: "alfred" });
    s("sensor.cuisine_alfred_cleaning_time", 31, { unit_of_measurement: "min" }, { p: "roborock", dev: "alfred" });
    // téléphones et tablettes (application Companion, noms fictifs)
    const phones = [["tel_paul", "Téléphone Paul", "Google Pixel 8", 82, "discharging", "home", "Maison-5G", 54, "Wi-Fi"],
      ["tel_julie", "Téléphone Julie", "Samsung Galaxy S23", 14, "discharging", "not_home", null, 31, "cellular"],
      ["tab_salon", "Tablette salon", "Lenovo Tab M8", 63, "charging", "home", "Maison", 72, "wifi"],
      ["tab_leo", "Tablette Léo", "Xiaomi Pad 6", 100, "full", "home", "Maison", 18, "wifi"]];
    for (const [k, name, model, bat, bs, where, ssid, store, net] of phones) {
      devices[k] = { id: k, name, manufacturer: model.split(" ")[0], model: model.split(" ").slice(1).join(" ") };
      const m = (dom, suf, v, attrs = {}) => s(`${dom}.${k}_${suf}`, v, attrs, { p: "mobile_app", dev: k, ...(k === "tab_salon" && o.phoneOff ? { lc: iso(-3 * D) } : {}) });
      m("sensor", "battery_level", bat, { unit_of_measurement: "%", device_class: "battery" });
      m("sensor", "battery_state", bs);
      m("binary_sensor", "is_charging", bs === "charging" ? "on" : "off");
      m("sensor", "charger_type", bs === "charging" ? "ac" : "none");
      m("sensor", "battery_temperature", 27.5 + bat / 20, { unit_of_measurement: "°C" });
      m("sensor", "battery_health", "good");
      m("sensor", "wifi_connection", ssid || "<not connected>");
      m("sensor", "network_type", net);
      m("sensor", "internal_storage", store, { unit_of_measurement: "%" });
      m("sensor", "next_alarm", k === "tel_paul" ? iso(14 * H) : "unavailable", { device_class: "timestamp" });
      m("sensor", "last_reboot", iso(-(4 + bat / 10) * D), { device_class: "timestamp" });
      m("sensor", "os_version", "14");
      m("sensor", "current_version", "2026.10.1-full");
      if (k.startsWith("tel")) m("sensor", "daily_steps", k === "tel_paul" ? 6420 : 9810, { unit_of_measurement: "steps" });
      m("sensor", "ringer_mode", k === "tel_julie" ? "vibrate" : "normal");
      s(`device_tracker.${k}`, where, { source_type: "gps" }, { p: "mobile_app", dev: k, ...(k === "tab_salon" && o.phoneOff ? { lc: iso(-3 * D) } : {}) });
    }
    s("sensor.cuisine_alfred_battery", 80, { unit_of_measurement: "%", device_class: "battery" }, { p: "roborock", dev: "alfred" });
    s("input_boolean.vider_bac_poussiere", o.bac === false ? "off" : "on", { friendly_name: "Vider le bac" });
    s("switch.deshumidificateur", "on", {});
    s("sensor.cagibi_temperature_humidity", 62, { unit_of_measurement: "%" });
    s("binary_sensor.cagibi_reservoir_deshumidificateur_water_leak", "off", { device_class: "moisture" });
    ["dimanche", "lundi", "mardi", "mercredi"].forEach((d, i) => s(`binary_sensor.${d}`, i === 1 ? "on" : "off", {}));
    s("counter.compteur_sodastream", 3, {});
    s("sensor.eta_alex", 12, { unit_of_measurement: "min" });
    s("input_boolean.alex_revient", "on", {});
    s("person.alex", "not_home", {});
    // alarme, modes
    s("alarm_control_panel.maison", o.alarm || "armed_night", { supported_features: 63, friendly_name: "Maison", code_format: null }, { p: "manual" });
    s("input_select.mode_volets", o.voletsMode || "maison", { options: ["maison", "rdc", "etage", "auto"] });
    s("cover.voletsmaison", "open", { current_position: 100, supported_features: 15, friendly_name: "Volets maison" });
    s("cover.voletsrdc", "closed", { current_position: 0, supported_features: 15 });
    s("cover.voletsetage", "open", { current_position: 40, supported_features: 15 });
    s("input_select.mode_ballon", o.ballon || "électrique", { options: ["off", "électrique", "chaudière", "marche forcée"], friendly_name: "Ballon" });
    s("sensor.chaufferie_prise_ballon_power", 1850, { unit_of_measurement: "W" });
    s("input_select.mode_chauffage", o.chauffage || "confort", { options: ["off", "nuit", "home office", "confort", "turbo", "reduit", "vacances"], friendly_name: "Chauffage" });
    s("climate.salle_a_manger", "heat", { temperature: 20.5, current_temperature: 20.1 });
    s("select.recroom_hub_activities", "Regarder un film", { options: ["power_off", "Jouer a la PS5", "Jouer a la Switch", "Regarder un film"], friendly_name: "Activités" });
    // pièces
    const room = (area, t, h, extra = []) => {
      s(`sensor.${area}_temperature`, t, { unit_of_measurement: "°C", device_class: "temperature" }, { area });
      s(`sensor.${area}_humidity`, h, { unit_of_measurement: "%", device_class: "humidity" }, { area });
      extra.forEach((x) => x());
    };
    const door = (id, on, area) => () => s(id, on ? "on" : "off", { device_class: "window", friendly_name: id.split(".")[1] }, { area });
    const light = (id, on, area, name) => () => s(id, on ? "on" : "off", { friendly_name: name, brightness: on ? 191 : undefined }, { area, p: "hue" });
    room("salon", 21.4, 55, [door("binary_sensor.salon_capteurfenetre_contact", true, "salon"), light("light.salon_lumieres", true, "salon", "Salon"), light("light.lumieres_ambiance", false, "salon", "Ambiance")]);
    room("cuisine", 22.8, 61, [door("binary_sensor.cuisine_capteurfenetre_contact", false, "cuisine")]);
    room("bureau", 20.2, 48, [light("light.bureau_ampoule", false, "bureau", "Bureau")]);
    room("sam", 21.1, 52, [light("light.lumiere_sejour", false, "sam", "Séjour")]);
    room("sdbrdc", 23.9, 74, []);
    room("chambre_leo", 19.6, 50, [light("light.wled_chambre_leo", true, "chambre_leo", "Chambre Léo"), door("binary_sensor.chambrechambre_leo_capteurvelux_contact", false, "chambre_leo")]);
    room("chambre_emma", 19.9, 49, [light("light.lampes_chambre_emma", false, "chambre_emma", "Chambre Emma")]);
    room("chambre_parents", 20.4, 51, [light("light.chambre_parents_ventilateur", false, "chambre_parents", "Chambre parents")]);
    room("sdbetage", 22.3, 68, []);
    room("degagement", 20.0, 50, [light("light.degagement_lampemurphy", false, "degagement", "Murphy")]);
    room("recroom", 18.7, 57, [light("light.recroom_kallax", false, "recroom", "Kallax")]);
    room("cagibi", 16.2, 62, []);
    room("buanderie", 17.4, 66, []);
    room("atelier", 15.8, 64, [light("light.atelier_lampe", false, "atelier", "Atelier")]);
    s("light.wled_canape", "off", { friendly_name: "Bureau sous-sol" }, { area: "bureau_ss" });
    s("light.shelly1_485519c9a2f1", "on", { friendly_name: "Salle ciné", brightness: 255 }, { area: "recroom" });
    s("light.jardin_lampeperon", "off", { friendly_name: "Jardin" }, { area: "jardin" });
    s("light.jardin_lumiere", "off", { friendly_name: "Extérieur" }, { area: "jardin" });
    s("media_player.shield_3", o.media === false ? "idle" : "playing", { media_title: "Le Grand Bleu", entity_picture: img("#1f4e79", "Le Grand Bleu"), friendly_name: "Shield salon" }, { area: "salon" });
    s("image.image_jellyfin_salon", "2026-10-23", { entity_picture: img("#1f4e79", "Film") });
    // volets
    const cover = (id, pos, area, name) => s(id, pos > 0 ? "open" : "closed", { current_position: pos, supported_features: 15, friendly_name: name }, { area });
    cover("cover.velux_external_cover_roller_shutter_2", 100, "chambre_leo", "Chambre Léo");
    cover("cover.chambre_chambre_parents_volet_fenetre", 30, "chambre_parents", "Chambre parents");
    cover("cover.salon_volet_fenetre", 100, "salon", "Salon");
    cover("cover.sdb_rdc_volet_fenetre", 0, "sdbrdc", "Salle de bain");
    cover("cover.salle_a_manger_volet_fenetre", 70, "sam", "Fenêtre séjour");
    cover("cover.salle_a_manger_volet_baie_2", 70, "sam", "Baie séjour");
    cover("cover.cuisine_volet_fenetre", 100, "cuisine", "Fenêtre cuisine");
    cover("cover.cuisine_volet_porte", 0, "cuisine", "Porte cuisine");
    // tuiles du bas
    s("input_boolean.sdb_rdc_max2h", "off", {});
    s("input_boolean.sdb_etage_max2h", "on", {});
    s("switch.bouclage", "on", {});
    s("switch.sdb_rdc_seche_serviettes", "off", {});
    s("switch.sdb_etage_seche_serviettes", "on", {});
    s("input_boolean.arrosageauto", "on", {});
    s("counter.arrosage_restant", 12, {});
    s("sensor.jardin_capteurhumidite_soil_moisture", 34, { unit_of_measurement: "%" });
    // menu
    const recettes = {
      samedi: ["Pizza maison", "1- pâte 2- sauce tomate 3- mozzarella", "1- étaler la pâte 2- garnir 3- 12 min à 250 °C"],
      dimanche: ["Poulet rôti et pommes de terre", "1- poulet 2- pommes de terre 3- thym", "1- 1 h 15 au four à 200 °C"],
      lundi: ["Soupe de potiron", "1- potiron 2- oignon 3- crème", "1- cuire 25 min 2- mixer"],
      mardi: ["Gratin dauphinois", "1- pommes de terre 2- crème 3- ail", "1- 1 h au four"],
      mercredi: ["Pâtes carbonara", "1- spaghetti 2- lardons 3- œufs 4- parmesan", "1- cuire les pâtes 2- mélanger hors du feu"],
      jeudi: ["Lasagnes", "1- feuilles 2- bolognaise 3- béchamel", "1- monter 2- 45 min au four"],
      vendredi: ["Saumon et riz", "1- saumon 2- riz basmati 3- citron", "1- 15 min au four"],
    };
    for (const [d, [n, ing, det]] of Object.entries(recettes)) s(`sensor.menu_${d}_2`, d, { recette_nom: n.replace("'", "&#39"), recette_ingredients: ing, recette_details: det });
    s("input_select.jour_menu", o.jour || "mercredi", { options: Object.keys(recettes) });
    s("todo.shopping_list", 3, { friendly_name: "Liste de courses" });
    // météo, agenda, jauges
    s("weather.forecast_home", "partlycloudy", { temperature: 14, humidity: 70, friendly_name: "Maison" });
    s("sensor.gw1100a_outdoor_temperature", 14.6, { unit_of_measurement: "°C", device_class: "temperature" });
    s("sensor.gw1100a_humidity", 71, { unit_of_measurement: "%" });
    const ev = (dd, hh, sum) => { const d = new Date(); d.setDate(d.getDate() + dd); d.setHours(hh, 30, 0, 0); return { start: d.toISOString(), end: new Date(d.getTime() + H).toISOString(), summary: sum }; };
    s("sensor.my_chambre_parents_calendar", 4, { events: [ev(0, 18, "Entraînement de basket"), ev(1, 9, "Dentiste"), ev(3, 14, "Réunion parents-profs"), ev(6, 10, "Anniversaire de Léa")] });
    s("sensor.electricite_daily", 18.4, { unit_of_measurement: "kWh", friendly_name: "Électricité" });
    s("sensor.salle_serveur_wattmetre_electric_consumption_w", 312, { unit_of_measurement: "W", icon: "mdi:home" });
    s("sensor.puissance_solaire", 1240, { unit_of_measurement: "W" });
    s("sensor.compteur_eau_litres", 210, { unit_of_measurement: "L", friendly_name: "Eau" });
    s("sensor.energy_pellets_daily", 9, { unit_of_measurement: "kg" });
    s("sensor.niveau_cuve", 78, { unit_of_measurement: "%" });

    // batteries de voiture suivies par des boîtiers BM6 (noms fictifs)
    for (const [k, name, v, pct, pdev, cond, temp, rssi] of [["bm6_aa", "Batterie Clio", 12.52, 86, 74, "normal", 14, -78], ["bm6_bb", "Batterie Kangoo", 12.08, 40, 26, "low_voltage", 11, -90]]) {
      devices[k] = { id: k, name, manufacturer: "BM6", model: "Battery Monitor BM6" };
      const b = (suf, val, attrs = {}) => s(`sensor.${k}_${suf}`, val, attrs, { p: "bm6", dev: k, lc: iso(-6 * 60e3) });
      b("tension", v, { unit_of_measurement: "V", device_class: "voltage", friendly_name: `${name} Tension` });
      b("pour_cent", pct, { unit_of_measurement: "%", device_class: "battery", state_algorithm: "soc_sod", friendly_name: `${name} Charge` });
      b("pourcentage_de_l_appareil", pdev, { unit_of_measurement: "%", device_class: "battery", friendly_name: `${name} Charge (BM6)` });
      b("stan", "discharging", { friendly_name: `${name} État` });
      b("condition_de_l_appareil", cond, { friendly_name: `${name} État (BM6)` });
      b("temperature", temp, { unit_of_measurement: "°C", device_class: "temperature", friendly_name: `${name} Température` });
      b("force_du_signal_rssi", rssi, { unit_of_measurement: "dBm", device_class: "signal_strength", friendly_name: `${name} Force du signal` });
      b("lenteur", 0, { friendly_name: `${name} Baisse rapide de tension` });
      b("acceleration", 1, { friendly_name: `${name} Hausse rapide de tension` });
      b("skaner_bluetooth", "proxy-garage (AA:BB:CC:00:11:22)", { friendly_name: `${name} Scanner Bluetooth` });
    }
    // voitures suivies par Torque Pro (intégration Torque OBD-II, noms fictifs)
    for (const [k, name, live] of [["tq_clio", "Clio", true], ["tq_kangoo", "Kangoo", false]]) {
      devices[k] = { id: k, name, manufacturer: "Torque Pro", model: "OBD-II" };
      const q = (suf, pid, val, unit, fn, lc) => s(`sensor.${k}_${suf}`, val, { pid, friendly_name: `${name} ${fn}`, ...(unit ? { unit_of_measurement: unit } : {}) }, { p: "torque_obd", dev: k, lc });
      s(`binary_sensor.${k}_torque_connecte`, live ? "on" : "off", { device_class: "connectivity", friendly_name: `${name} Torque connecté` }, { p: "torque_obd", dev: k });
      s(`device_tracker.${k}_position`, live ? "not_home" : "home", { source_type: "gps", friendly_name: `${name} Position` }, { p: "torque_obd", dev: k });
      q("vitesse_du_vehicule", "kd", live ? 82 : 0, "km/h", "Vitesse du véhicule");
      q("regime_moteur", "kc", live ? 2150 : 0, "RPM", "Régime moteur");
      q("temperature_du_liquide_de_refroidissement", "k5", live ? 89 : 31, "°C", "Température du liquide de refroidissement");
      q("litres_aux_100_km_instantane", "kff1207", live ? 5.8 : 0, "L/100km", "Litres aux 100 km (instantané)");
      q("distance_du_trajet", "kff1204", live ? 14.2 : 23.6, "km", "Distance du trajet", live ? undefined : iso(-5 * H));
      q("duree_du_trajet_en_mouvement", "kff1268", live ? 960 : 1680, "s", "Durée du trajet (en mouvement)");
      q("vitesse_moyenne_du_trajet", "kff1272", live ? 53 : 51, "km/h", "Vitesse moyenne du trajet (à l'arrêt ou en mouvement)");
      q("litres_100_km_moyen_du_trajet", "kff1208", live ? 6.1 : 7.4, "L/100km", "Litres/100 km moyen du trajet");
      q("litres_aux_100_km_moyenne_long_terme", "kff5203", live ? 6.4 : 7.9, "L/100km", "Litres aux 100 km (moyenne long terme)");
      q("tension_adaptateur_obd", "kff1238", live ? 14.1 : 12.1, "V", "Tension (adaptateur OBD)");
      q("charge_moteur", "k4", live ? 34 : 0, "%", "Charge moteur");
      q("distance_parcourue_avec_voyant_mil_cel_allume", "k21", live ? 0 : 37, "km", "Distance parcourue avec voyant MIL/CEL allumé");
      q("kilometrage_total", "k222006", live ? 84210 : 142380, "km", `${live ? "Clio" : "Kangoo"} - Kilométrage total`);
      if (live) q("niveau_de_carburant", "k2f", 58, "%", "Niveau de carburant");
      q("temperature_huile_moteur", "k222007", live ? 96 : 28, "°C", `${name} - Température huile moteur`);
      if (live) q("rapport_engage", "k2101_slkgear", 5, null, `${name} - Rapport engagé`);
      if (!live) q("carburant_dans_le_reservoir", "k222201", 21.5, "L", `${name} - Carburant dans le réservoir`);
    }
    const areas = {};
    const floors = {
      rdc: { floor_id: "rdc", name: "Rez-de-chaussée", level: 0, icon: null },
      etage: { floor_id: "etage", name: "Étage", level: 1, icon: null },
      soussol: { floor_id: "soussol", name: "Sous-sol", level: -1, icon: null },
    };
    const A = (id, name, floor, icon) => { areas[id] = { area_id: id, name, floor_id: floor, icon }; };
    A("salon", "Salon", "rdc", "mdi:sofa"); A("cuisine", "Cuisine", "rdc", "mdi:countertop"); A("bureau", "Bureau", "rdc", "mdi:desk");
    A("sam", "Salle à manger", "rdc", "mdi:silverware-variant"); A("sdbrdc", "Salle de bain", "rdc", "mdi:shower");
    A("chambre_leo", "Chambre Léo", "etage", "mdi:bed"); A("chambre_emma", "Chambre Emma", "etage", "mdi:crown"); A("chambre_parents", "Chambre parents", "etage", "mdi:bed");
    A("sdbetage", "Salle de bain étage", "etage", "mdi:shower-head"); A("degagement", "Biblio", "etage", "mdi:library");
    A("recroom", "Salle ciné", "soussol", "mdi:play"); A("cagibi", "Cagibi", "soussol", "mdi:library-shelves"); A("buanderie", "Buanderie", "soussol", "mdi:washing-machine");
    A("atelier", "Atelier", "soussol", "mdi:tools"); A("bureau_ss", "Bureau sous-sol", "soussol", "mdi:desktop-tower-monitor"); A("jardin", "Jardin", null, "mdi:grass");

    const calls = [];
    const hist = (id) => {
      const base = num(st[id]?.state) ?? 20;
      const now = Date.now();
      const rows = [];
      if (/_tension$/.test(id)) {
        for (let i = 96; i >= 0; i--) {
          const drive = i >= 40 && i <= 43;
          rows.push({ state: String(drive ? 14.1 : (base + i * 0.0025 + Math.sin(i / 7) * 0.015).toFixed(2)), last_changed: new Date(now - i * 0.5 * H).toISOString() });
        }
        return [rows];
      }
      for (let i = 48; i >= 0; i--) rows.push({ state: String((base + Math.sin(i / 5 + base) * 1.4 - i * 0.01).toFixed(1)), last_changed: new Date(now - i * 0.5 * H).toISOString() });
      return [rows];
    };
    function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
    const forecast = [0, 1, 2, 3, 4, 5].map((i) => ({ datetime: iso(i * D), condition: ["partlycloudy", "rainy", "cloudy", "sunny", "sunny", "pouring"][i], temperature: [16, 13, 14, 18, 19, 12][i], templow: [8, 9, 7, 6, 9, 8][i] }));
    const hass = {
      states: st, entities: ent, areas, floors, devices,
      themes: { darkMode: !!o.dark }, language: "fr", user: { name: "Test" },
      callService: (d, sv, data, target) => { calls.push([`${d}.${sv}`, data, target]); window.__calls = calls; return Promise.resolve(); },
      callApi: (m, path) => {
        const id = decodeURIComponent((/filter_entity_id=([^&]+)/.exec(path) || [])[1] || "");
        return Promise.resolve(hist(id));
      },
      callWS: (msg) => {
        if (msg.type === "todo/item/list") return Promise.resolve({ items: [{ uid: "1", summary: "Lait", status: "needs_action" }, { uid: "2", summary: "Pain", status: "needs_action" }, { uid: "3", summary: "Pommes", status: "needs_action" }, { uid: "4", summary: "Café", status: "completed" }] });
        return Promise.resolve({});
      },
      connection: {
        subscribeMessage: (cb, msg) => { setTimeout(() => cb({ type: msg.forecast_type, forecast }), 10); return Promise.resolve(() => {}); },
      },
      __calls: calls,
    };
    return hass;
  };
})();
