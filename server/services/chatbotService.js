/**
 * server/services/chatbotService.js — Central AI Safety Assistant Knowledge & Intent Engine (Module 9)
 */

const https = require('https');
const http = require('http');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── 1. INTENT CLASSIFICATION ─────────────────────────────
function detectIntent(message) {
  const text = (message || '').toLowerCase().trim();

  // POLICE LOOKUP INTENT
  if (
    text.includes('police') ||
    text.includes('cop') ||
    text.includes('patrol') ||
    text.includes('thana') ||
    text.includes('chowki') ||
    (text.includes('station') && !text.includes('train') && !text.includes('metro') && !text.includes('bus') && !text.includes('fire'))
  ) {
    return 'POLICE';
  }

  // HOSPITAL LOOKUP INTENT
  if (
    text.includes('hospital') ||
    text.includes('clinic') ||
    text.includes('doctor') ||
    text.includes('ambulance') ||
    text.includes('casualty') ||
    text.includes('emergency room') ||
    text.includes('trauma') ||
    text.includes('medical centre') ||
    text.includes('medical center')
  ) {
    return 'HOSPITAL';
  }

  // FIRST AID INTENT
  if (
    text.includes('first aid') ||
    text.includes('bleed') ||
    text.includes('burn') ||
    text.includes('faint') ||
    text.includes('cpr') ||
    text.includes('choking') ||
    text.includes('sprain') ||
    text.includes('fracture') ||
    text.includes('wound') ||
    (text.includes('cut') && !text.includes('shortcut')) ||
    text.includes('unconscious')
  ) {
    return 'FIRST_AID';
  }

  // LEGAL ASSISTANCE INTENT
  if (
    text.includes('legal') ||
    text.includes('law') ||
    text.includes('fir') ||
    text.includes('harassment') ||
    text.includes('posh') ||
    text.includes('complaint') ||
    text.includes('lawyer') ||
    text.includes('rights') ||
    text.includes('ncw') ||
    text.includes('nalsa') ||
    text.includes('court') ||
    text.includes('ipc') ||
    text.includes('bns') ||
    text.includes('stalk')
  ) {
    return 'LEGAL';
  }

  // EMERGENCY INTENT
  if (
    text.includes('attack') ||
    text.includes('emergency') ||
    text.includes('danger') ||
    text.includes('save me') ||
    text.includes('help me now') ||
    text.includes('trapped') ||
    text.includes('in danger') ||
    text.includes('sos') ||
    text.includes('bachao') ||
    text.includes('being attacked') ||
    text.includes('threatened') ||
    text.includes('immediate help')
  ) {
    return 'EMERGENCY';
  }

  // SAFETY GUIDANCE INTENT
  if (
    text.includes('walk') ||
    text.includes('alone') ||
    text.includes('followed') ||
    text.includes('unsafe') ||
    text.includes('scared') ||
    text.includes('travel') ||
    text.includes('night') ||
    text.includes('cab') ||
    text.includes('taxi') ||
    text.includes('dark') ||
    text.includes('safe') ||
    text.includes('precaution')
  ) {
    return 'SAFETY';
  }

  return 'GENERAL';
}

const SafetyLayer = require('../models/SafetyLayer');

// ── 2. REAL SPATIAL PLACES LOOKUP (OVERPASS / SAFETY LAYER) ──
async function fetchNearbyPlacesFromOverpass(lat, lng, amenityType, radius = 5000) {
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"="${amenityType}"](around:${radius},${lat},${lng});
      way["amenity"="${amenityType}"](around:${radius},${lat},${lng});
    );
    out center 6;
  `;

  const overpassResults = await new Promise((resolve) => {
    const postData = `data=${encodeURIComponent(query)}`;
    const options = {
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'User-Agent': 'SHE-GUARD-Safety-App/1.0 (contact@sheguard.app)',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 8000,
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          const elements = parsed.elements || [];
          const results = elements.map((el) => {
            const pLat = el.lat || (el.center && el.center.lat) || lat;
            const pLng = el.lon || (el.center && el.center.lon) || lng;
            const dist = haversineKm(lat, lng, pLat, pLng);
            const name = el.tags?.name || (amenityType === 'police' ? 'City Police Station' : 'Emergency Hospital & Clinic');
            return {
              name,
              type: amenityType === 'police' ? 'Police Station' : 'Hospital / Healthcare',
              distanceKm: parseFloat(dist.toFixed(2)),
              latitude: pLat,
              longitude: pLng,
              phone: el.tags?.phone || el.tags?.['contact:phone'] || (amenityType === 'police' ? '112 / 100' : '112 / 108'),
              address: el.tags?.['addr:street'] ? `${el.tags['addr:street']}, ${el.tags['addr:city'] || ''}` : 'Verified Public Facility',
              mapsUrl: `https://maps.google.com/?q=${pLat},${pLng}`,
              isOpen24Hours: el.tags?.opening_hours === '24/7' || true,
            };
          });

          // Sort by nearest distance
          results.sort((a, b) => a.distanceKm - b.distanceKm);
          resolve(results.slice(0, 4));
        } catch (e) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(postData);
    req.end();
  });

  if (overpassResults && overpassResults.length > 0) {
    return overpassResults;
  }

  // Fallback to verified local SafetyLayer nodes in database if Overpass times out
  try {
    const nodeType = amenityType === 'police' ? 'POLICE_PATROL' : null;
    const dbNodes = await SafetyLayer.getAllNodes(nodeType);
    if (dbNodes && dbNodes.length > 0) {
      return dbNodes.map(n => ({
        name: n.name,
        type: amenityType === 'police' ? 'Police Station' : 'Hospital / Healthcare',
        distanceKm: parseFloat(haversineKm(lat, lng, n.latitude, n.longitude).toFixed(2)),
        latitude: n.latitude,
        longitude: n.longitude,
        phone: amenityType === 'police' ? '112 / 100' : '108 / 112',
        address: n.description || 'Verified Public Safety Post',
        mapsUrl: `https://maps.google.com/?q=${n.latitude},${n.longitude}`,
        isOpen24Hours: true,
      })).slice(0, 3);
    }
  } catch (e) {}

  return [];
}

// ── 2.5 LLM GENERATIVE AI (GOOGLE GEMINI / OPENAI) ───────
async function callGeminiApi(prompt, context = {}) {
  const apiKey = process.env.GEMINI_API_KEY || context.geminiApiKey;
  if (!apiKey) return null;

  return new Promise((resolve) => {
    const systemPrompt = `You are SHE-GUARD AI Safety Assistant, a dedicated, empathetic, and protective 24/7 personal safety assistant for women.
Priorities:
1. Physical safety and life preservation are always #1 priority.
2. If the user indicates imminent danger or attack, urge them to trigger SHE-GUARD Smart SOS, shout for civilian help, head to a well-lit public space, and dial 112 (National Emergency Helpline).
3. If they ask about laws in India (IPC / Bharatiya Nyaya Sanhita (BNS), POSH Act 2013, Zero FIR, domestic violence), provide accurate, empowering legal information with a reminder that this is educational.
4. If they ask first aid, provide concise, numbered, step-by-step guidance.
5. If they ask about safety tactics (walking alone, taxi rides, stalkers, pepper spray, self defense), give practical, actionable tips.
6. Tone: Calm, reassuring, decisive, protective, and clear. Use clean markdown bullet points for fast reading.`;

    const requestBody = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\nUser location context: Latitude ${context.lat || 28.6139}, Longitude ${context.lng || 77.2090}\n\nUser Question/Message: ${prompt}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 650,
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      timeout: 9000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const replyText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) resolve(replyText.trim());
          else resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(requestBody);
    req.end();
  });
}

async function callOpenAiApi(prompt, context = {}) {
  const apiKey = process.env.OPENAI_API_KEY || context.openaiApiKey;
  if (!apiKey) return null;

  return new Promise((resolve) => {
    const requestBody = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are SHE-GUARD AI Safety Assistant, a dedicated, empathetic, and protective 24/7 personal safety assistant for women. Prioritize safety, concise bullet points, emergency 112 helpline, and Smart SOS.'
        },
        {
          role: 'user',
          content: `User coordinates: Lat ${context.lat || 28.6139}, Lng ${context.lng || 77.2090}\n\n${prompt}`
        }
      ],
      max_tokens: 650,
      temperature: 0.3,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      },
      timeout: 9000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const replyText = parsed.choices?.[0]?.message?.content;
          if (replyText) resolve(replyText.trim());
          else resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(requestBody);
    req.end();
  });
}

// ── 3. SAFETY KNOWLEDGE BASE & RESPONSE BUILDER ───────────
async function generateSafetyResponse({ message, userContext = {}, location = null }) {
  const intent = detectIntent(message);
  const text = message.toLowerCase();

  let responseContent = '';
  let structuredData = null;
  let quickActions = [];

  // Handle Lat/Lng
  const currentLat = location && location.latitude ? parseFloat(location.latitude) : 28.6139;
  const currentLng = location && location.longitude ? parseFloat(location.longitude) : 77.2090;

  // Try Generative LLM (Gemini / OpenAI) first for conversational queries
  const hasLlmKey = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || userContext.geminiApiKey || userContext.openaiApiKey);
  if (hasLlmKey && intent !== 'POLICE' && intent !== 'HOSPITAL') {
    const llmReply = await (callGeminiApi(message, { lat: currentLat, lng: currentLng, ...userContext }) ||
                            callOpenAiApi(message, { lat: currentLat, lng: currentLng, ...userContext }));
    if (llmReply) {
      return {
        content: llmReply,
        intent,
        structuredData: intent === 'EMERGENCY' ? { type: 'EMERGENCY_ALERT', showSosButton: true, showCall112: true } : null,
        quickActions: intent === 'EMERGENCY'
          ? [{ label: '🚨 Trigger Smart SOS', action: 'TRIGGER_SOS', variant: 'danger' }]
          : [{ label: '👮 Nearby Police', action: 'FIND_POLICE', variant: 'primary' }, { label: '🏥 Nearby Hospital', action: 'FIND_HOSPITAL', variant: 'outline' }],
      };
    }
  }

  switch (intent) {
    // ──────── 1. EMERGENCY INSTRUCTIONS & SMART SOS ────────
    case 'EMERGENCY': {
      responseContent = `🚨 **IMMEDIATE EMERGENCY ACTION REQUIRED**\n\n` +
        `If you are in immediate danger, prioritize your physical safety right now:\n\n` +
        `1. **Move to Safety**: Head toward populated, well-lit spaces, open storefronts, or security guards.\n` +
        `2. **Trigger SHE-GUARD Smart SOS**: Tap the button below to instantly alert your emergency contacts with your live GPS location.\n` +
        `3. **Call Police Helpline**: Dial **112** (All-in-One Emergency) or **1091** (Women Helpline).\n` +
        `4. **Make Noise**: Shout loudly (*"Help! Fire! Police!"*) to draw civilian attention.\n` +
        `5. **Fake Call**: If you need a discreet distraction to leave an uncomfortable space, use our Fake Call feature.`;

      structuredData = {
        type: 'EMERGENCY_ALERT',
        showSosButton: true,
        showCall112: true,
        emergencyHelplines: [
          { name: 'National Emergency', number: '112' },
          { name: 'Women Helpline', number: '1091' },
          { name: 'Police Control Room', number: '100' },
        ],
      };

      quickActions = [
        { label: '🚨 Trigger Smart SOS', action: 'TRIGGER_SOS', variant: 'danger' },
        { label: '👮 Find Nearest Police', action: 'FIND_POLICE', variant: 'primary' },
        { label: '📞 Call 112 Now', action: 'CALL_112', variant: 'outline' },
      ];
      break;
    }

    // ──────── 2. NEARBY POLICE STATION LOOKUP ────────
    case 'POLICE': {
      let stations = [];
      try {
        stations = await fetchNearbyPlacesFromOverpass(currentLat, currentLng, 'police', 6000);
      } catch (e) {}

      if (!stations || stations.length === 0) {
        responseContent = `👮 **Nearest Police Assistance**\n\n` +
          `No specific police stations were found directly mapped within 6 km of your current GPS coordinates in OpenStreetMap.\n\n` +
          `📞 **Immediate Emergency Contact**:\n` +
          `• Dial **112** (National Emergency Response Support System - ERSS)\n` +
          `• Dial **100** (Police Control Room)\n` +
          `• Dial **1091** (Women Helpline)\n\n` +
          `Tap **[🚨 Trigger Smart SOS]** below to alert your emergency contacts immediately with your live GPS coordinates.`;

        structuredData = {
          type: 'PLACES_LIST',
          category: 'POLICE',
          places: [],
        };
      } else {
        responseContent = `👮 **Nearby Verified Police Stations**\n\n` +
          `Here are the closest verified police stations and patrol posts near your location:\n\n` +
          stations.map((s, i) => `${i + 1}. **${s.name}** (${s.distanceKm} km)\n   📍 ${s.address}\n   📞 Emergency: ${s.phone}`).join('\n\n') +
          `\n\nTap **[View on Map]** on any station below to open direct turn-by-turn navigation corridor.`;

        structuredData = {
          type: 'PLACES_LIST',
          category: 'POLICE',
          places: stations,
        };
      }

      quickActions = [
        { label: '🗺️ Open Safe Route', action: 'OPEN_SAFE_ROUTE', variant: 'primary' },
        { label: '🚨 Emergency SOS', action: 'TRIGGER_SOS', variant: 'danger' },
      ];
      break;
    }

    // ──────── 3. HOSPITAL RECOMMENDATIONS ────────
    case 'HOSPITAL': {
      let hospitals = [];
      try {
        hospitals = await fetchNearbyPlacesFromOverpass(currentLat, currentLng, 'hospital', 6000);
      } catch (e) {}

      if (!hospitals || hospitals.length === 0) {
        responseContent = `🏥 **Emergency Medical Assistance**\n\n` +
          `No registered hospitals or emergency clinics were found mapped within 6 km of your current GPS coordinates in OpenStreetMap.\n\n` +
          `📞 **Emergency Medical Helplines**:\n` +
          `• Dial **108** (National Ambulance Service)\n` +
          `• Dial **112** (All-in-One Emergency)\n` +
          `• Dial **102** (Maternity & Child Emergency Transport)\n\n` +
          `If you or someone is injured, ambulance dispatchers can locate your live GPS location.`;

        structuredData = {
          type: 'PLACES_LIST',
          category: 'HOSPITAL',
          places: [],
        };
      } else {
        responseContent = `🏥 **Nearby 24/7 Emergency Hospitals & Healthcare Centers**\n\n` +
          `Here are the closest verified medical facilities equipped for emergency trauma and general care:\n\n` +
          hospitals.map((h, i) => `${i + 1}. **${h.name}** (${h.distanceKm} km)\n   📍 ${h.address}\n   📞 Medical Line: ${h.phone} · 24/7 Service: Yes`).join('\n\n') +
          `\n\n*Disclaimer: In life-threatening emergencies, dial **108 / 112** for ambulance dispatch.*`;

        structuredData = {
          type: 'PLACES_LIST',
          category: 'HOSPITAL',
          places: hospitals,
        };
      }

      quickActions = [
        { label: '🚑 Call Ambulance (108)', action: 'CALL_108', variant: 'danger' },
        { label: '🩹 First Aid Guide', action: 'SHOW_FIRST_AID', variant: 'outline' },
      ];
      break;
    }

    // ──────── 4. FIRST AID INFORMATION ────────
    case 'FIRST_AID': {
      if (text.includes('burn')) {
        responseContent = `🩹 **First Aid: Minor Burns & Scalds**\n\n` +
          `1. **Cool the Burn**: Hold the burned area under cool, gently running tap water for at least 10–20 minutes. *Do NOT use ice or ice water.*\n` +
          `2. **Remove Tight Items**: Gently take off rings, bracelets, or tight clothing around the burn before swelling begins.\n` +
          `3. **Cover Cleanly**: Cover loosely with a sterile, non-stick bandage or clean cling wrap.\n` +
          `4. **Do NOT Break Blisters**: Breaking blisters exposes raw skin to infection.\n` +
          `5. **Avoid Ointments**: Do not apply butter, toothpaste, or oils.\n\n` +
          `*⚠️ Seek immediate hospital care if the burn is larger than 3 inches, on the face, hands, or caused by chemicals/electricity.*`;
      } else if (text.includes('bleed') || text.includes('wound') || text.includes('cut')) {
        responseContent = `🩹 **First Aid: Severe Bleeding & Cuts**\n\n` +
          `1. **Direct Pressure**: Apply firm, continuous pressure directly over the wound using a clean cloth, sterile pad, or bare hands if nothing else is available.\n` +
          `2. **Elevate**: If possible and no bone fracture is suspected, raise the bleeding limb above heart level.\n` +
          `3. **Keep Pressure Constant**: Do not remove soaked gauze; layer fresh cloths over it and maintain pressure.\n` +
          `4. **Calm the Person**: Keep them seated or lying down to prevent fainting from blood loss shock.\n\n` +
          `*⚠️ Call **112 / 108** immediately if bleeding spurts or does not stop after 10 minutes of direct pressure.*`;
      } else if (text.includes('faint') || text.includes('unconscious')) {
        responseContent = `🩹 **First Aid: Fainting (Syncope) & Dizziness**\n\n` +
          `1. **Position Flat**: Lay the person flat on their back and elevate their feet ~12 inches (30 cm) to restore blood flow to the brain.\n` +
          `2. **Loosen Clothing**: Loosen tight collars, ties, or belts.\n` +
          `3. **Fresh Air**: Ensure adequate ventilation and keep crowds back.\n` +
          `4. **Check Breathing**: Ensure airways are open and they are breathing normally.\n` +
          `5. **Do NOT Rush**: Once they regain consciousness, let them rest for 10 minutes before slowly sitting up.\n\n` +
          `*⚠️ If the person does not wake up within 1 minute or has no pulse, call **112** and begin CPR.*`;
      } else if (text.includes('chok')) {
        responseContent = `🩹 **First Aid: Choking (Heimlich Maneuver)**\n\n` +
          `1. **Encourage Coughing**: If the person can speak or cough forcefully, urge them to keep coughing.\n` +
          `2. **5 Back Blows**: Stand slightly behind, lean them forward, and deliver 5 sharp blows between shoulder blades with heel of hand.\n` +
          `3. **5 Abdominal Thrusts**: Place a fist just above their navel, grasp with other hand, and pull inward and upward sharply 5 times.\n` +
          `4. **Repeat**: Alternate 5 back blows and 5 abdominal thrusts until object dislodges.\n\n` +
          `*⚠️ If victim loses consciousness, lower to ground, call **112**, and begin chest compressions.*`;
      } else {
        responseContent = `🩹 **First Aid Information & Emergency Procedures**\n\n` +
          `Here are standard emergency first-aid protocols:\n\n` +
          `• **Severe Bleeding**: Continuous direct pressure with clean cloth + elevation.\n` +
          `• **Burns**: Cool running water for 15 minutes (no ice/butter) + loose sterile cover.\n` +
          `• **Fainting**: Lay flat, elevate feet 12 inches, loosen tight clothing.\n` +
          `• **Sprains (R.I.C.E.)**: Rest, Ice (15m), Compression bandage, Elevation.\n` +
          `• **Choking**: 5 back blows alternating with 5 abdominal Heimlich thrusts.\n\n` +
          `*Notice: I am an AI Safety Assistant, not a medical professional. For serious injuries, visit a nearby hospital or call 108 / 112.*`;
      }

      structuredData = {
        type: 'FIRST_AID_CARD',
        disclaimer: 'General first-aid guidance only. Seek professional emergency medical care for serious injuries.',
      };

      quickActions = [
        { label: '🏥 Find Nearby Hospital', action: 'FIND_HOSPITAL', variant: 'primary' },
        { label: '📞 Call Ambulance (108)', action: 'CALL_108', variant: 'outline' },
      ];
      break;
    }

    // ──────── 5. LEGAL ASSISTANCE INFORMATION ────────
    case 'LEGAL': {
      responseContent = `⚖️ **Women's Safety & Legal Rights Information**\n\n` +
        `Under Indian Law (IPC / BNS & Special Acts), women are entitled to strict legal protections:\n\n` +
        `1. **Zero FIR (Mandatory Filing)**:\n` +
        `   • You can lodge an FIR at **any police station**, regardless of where the incident occurred.\n` +
        `   • The police cannot refuse registration on territorial jurisdiction grounds.\n\n` +
        `2. **Protection Against Harassment & Assault**:\n` +
        `   • **Section 354 IPC / BNS 74**: Outraging modesty of a woman (cognizable & non-bailable).\n` +
        `   • **Section 354D / BNS 78**: Stalking (physical or digital monitoring).\n` +
        `   • **Section 509 / BNS 79**: Words, gestures, or acts intended to insult modesty.\n\n` +
        `3. **Workplace Harassment (POSH Act 2013)**:\n` +
        `   • Every organization with 10+ employees must have an Internal Complaints Committee (ICC).\n` +
        `   • Complaints must be investigated within 90 days.\n\n` +
        `4. **Free Legal Aid (NALSA)**:\n` +
        `   • Under Section 12 of Legal Services Authorities Act, **all women are entitled to free legal assistance and government-appointed counsel**.\n` +
        `   • **National Legal Aid Helpline: 15100**\n` +
        `   • **National Commission for Women (NCW): 7827170170**\n\n` +
        `*Notice: This is general legal education and does not constitute formal attorney-client legal advice.*`;

      structuredData = {
        type: 'LEGAL_INFO',
        helplines: [
          { name: 'National Legal Aid (NALSA)', number: '15100' },
          { name: 'NCW 24/7 Helpline', number: '7827170170' },
          { name: 'Women Helpline', number: '1091' },
        ],
      };

      quickActions = [
        { label: '👮 Find Nearest Police', action: 'FIND_POLICE', variant: 'primary' },
        { label: '📞 Call NCW Helpline', action: 'CALL_NCW', variant: 'outline' },
      ];
      break;
    }

    // ──────── 6. SAFETY GUIDANCE (WALKING ALONE, TRAVEL, CAB) ────────
    case 'SAFETY':
    default: {
      if (text.includes('walk') || text.includes('alone') || text.includes('night')) {
        responseContent = `🛡️ **Safe Travel & Walking Alone Protocol**\n\n` +
          `1. **Stay on Monitored Corridors**: Use SHE-GUARD **Safe Route** to choose well-lit avenues with verified CCTV coverage.\n` +
          `2. **Share Live Location**: Enable Family Live Location Sharing in the **Location** tab so trusted contacts can see your transit in real-time.\n` +
          `3. **Keep Hands Free**: Keep your phone easily accessible in your hand or pocket with your finger near the SOS button.\n` +
          `4. **Avoid Distractions**: Keep one earbud off so you remain aware of approaching vehicles or footsteps.\n` +
          `5. **Discreet Escape**: If you feel uncomfortable near strangers, trigger our **Fake Call Generator** to simulate an active phone conversation with Mom or Boss.`;
      } else if (text.includes('follow') || text.includes('stalk')) {
        responseContent = `🛡️ **Action Steps if You Suspect You Are Being Followed**\n\n` +
          `1. **Change Pace & Direction**: Cross to the opposite side of the street or turn into a well-lit public area (cafe, pharmacy, gas station, transit hub).\n` +
          `2. **Do NOT Go Home Directly**: Avoid leading an unknown follower to an isolated residential doorstep.\n` +
          `3. **Head to a Public Safety Hub**: Walk directly toward the nearest police station or crowded shopping center.\n` +
          `4. **Alert Contacts**: Share your live location with your emergency contacts.\n` +
          `5. **Trigger Smart SOS**: If they continue following or close the distance, press and hold the **SOS** button.`;
      } else if (text.includes('cab') || text.includes('taxi') || text.includes('auto') || text.includes('uber')) {
        responseContent = `🛡️ **Safe Rideshare & Cab Travel Checklist**\n\n` +
          `1. **Verify Before Boarding**: Match the vehicle license plate, driver name, and car model with the app.\n` +
          `2. **Check Child Locks**: Ensure the rear interior door handles open from inside before departing.\n` +
          `3. **Share Ride Tracking**: Share your live GPS location link with family.\n` +
          `4. **Track the Route**: Keep your GPS navigation open. If the driver deviates off-course, ask them firmly why, and trigger SOS if they refuse to stop.`;
      } else {
        responseContent = `👋 **Hello! I am your SHE-GUARD AI Safety Assistant.**\n\n` +
          `I am here to protect and assist you 24/7. Here is what you can ask me anytime:\n\n` +
          `• 🚨 **Emergency**: *"Someone is attacking me"*, *"I need immediate help"*\n` +
          `• 👮 **Police**: *"Find the nearest police station"*, *"Where is the closest cop post?"*\n` +
          `• 🏥 **Hospitals**: *"Find a hospital near me"*, *"Nearest emergency clinic"*\n` +
          `• 🩹 **First Aid**: *"How to treat a burn?"*, *"What to do for severe bleeding?"*\n` +
          `• ⚖️ **Legal Rights**: *"How to file a Zero FIR?"*, *"Workplace harassment laws"*\n` +
          `• 🛡️ **Safety Advice**: *"I'm walking home alone"*, *"Someone is following me"*`;
      }

      quickActions = [
        { label: '👮 Nearby Police', action: 'FIND_POLICE', variant: 'primary' },
        { label: '🏥 Nearby Hospital', action: 'FIND_HOSPITAL', variant: 'primary' },
        { label: '🗺️ Safe Route', action: 'OPEN_SAFE_ROUTE', variant: 'outline' },
        { label: '📞 Fake Call', action: 'OPEN_FAKE_CALL', variant: 'outline' },
      ];
      break;
    }
  }

  return {
    content: responseContent,
    intent,
    structuredData,
    quickActions,
  };
}

module.exports = {
  detectIntent,
  generateSafetyResponse,
  fetchNearbyPlacesFromOverpass,
};
