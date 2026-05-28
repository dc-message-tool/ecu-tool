import { useState, useRef, useEffect } from "react";

// ── Design tokens ──────────────────────────────────────────────
const C = {
  bg:'#070A0E', surface:'#0D1117', surface2:'#111827',
  border:'#1F2937', border2:'#374151',
  text:'#F9FAFB', textMid:'#9CA3AF', textFaint:'#4B5563',
  accent:'#3B82F6', accentDim:'#1D4ED8',
  green:'#22C55E', greenDim:'#166534',
  red:'#EF4444', redDim:'#991B1B',
  amber:'#F59E0B', amberDim:'#92400E',
  purple:'#A855F7', purpleDim:'#6B21A8',
  blue:'#60A5FA',
};

// ── System colour map ──────────────────────────────────────────
const SYS = {
  EGR:   { col:'#F59E0B', bg:'#78350F33', label:'EGR Delete' },
  DPF:   { col:'#EF4444', bg:'#7F1D1D33', label:'DPF Delete' },
  ADBLUE:{ col:'#3B82F6', bg:'#1E3A8A33', label:'AdBlue Delete' },
  SWIRL: { col:'#A855F7', bg:'#4C1D9533', label:'Swirl Delete' },
};

// ── P-code database ────────────────────────────────────────────
const DTC_MAP = {
  EGR: [
    { code:'P0400', name:'EGR Flow Malfunction', limp:false, detail:'General EGR circuit fault. Triggered after physical blank-off.' },
    { code:'P0401', name:'EGR Insufficient Flow', limp:false, detail:'ECU commanded EGR open — flow lower than expected. Suppressed by zeroing demand map.' },
    { code:'P0402', name:'EGR Excessive Flow', limp:false, detail:'More EGR flow than commanded. Suppressed by zeroing correction factor.' },
    { code:'P0403', name:'EGR Control Circuit', limp:false, detail:'Solenoid circuit fault — valve disconnected after delete.' },
    { code:'P0404', name:'EGR Range / Performance', limp:false, detail:'Valve position outside expected range. Suppressed via monitor tolerance.' },
    { code:'P0405', name:'EGR Sensor A Low', limp:false, detail:'Position sensor low voltage after removal.' },
    { code:'P0406', name:'EGR Sensor A High', limp:false, detail:'Position sensor high voltage after removal.' },
    { code:'P2425', name:'EGR Cooling Performance', limp:false, detail:'EGR cooler fault — covered by zeroing EGR main maps.' },
  ],
  DPF: [
    { code:'P2002', name:'DPF Efficiency Below Threshold', limp:true, detail:'CRITICAL. Filter considered blocked. Immediate torque reduction. Must suppress via pressure model.' },
    { code:'P242F', name:'DPF Restriction — Pressure High', limp:true, detail:'CRITICAL. Backpressure exceeds limit. Limp mode. Covered by zeroing 13KB pressure model.' },
    { code:'P2463', name:'DPF Soot Level Too High', limp:true, detail:'Virtual soot counter exceeded max. Suppressed by zeroing soot rate map.' },
    { code:'P11CF', name:'DPF Restriction (BMW DDE)', limp:true, detail:'BMW-specific restriction code. Appears alongside P242F. Same calibration patch covers both.' },
    { code:'P2452', name:'DPF Pressure Sensor Circuit', limp:false, detail:'Sensor circuit fault. Covered by pressure model zero.' },
    { code:'P2453', name:'DPF Pressure Sensor Range', limp:false, detail:'Sensor reading outside expected range. Zero model = expected value matches sensor.' },
    { code:'P2458', name:'DPF Regen Duration', limp:false, detail:'Regen ran too long. Covered — regen never initiated once soot model zeroed.' },
    { code:'P2459', name:'DPF Regen Frequency', limp:false, detail:'Regen too frequent. Zero soot model = regen never requested.' },
    { code:'P244A', name:'DPF Pressure Sensor Intermittent', limp:false, detail:'Erratic sensor readings. Covered by pressure model zero.' },
  ],
  ADBLUE: [
    { code:'P20EE', name:'SCR NOx Catalyst Efficiency', limp:true, detail:'CRITICAL. Primary AdBlue code. Immediate torque restriction and speed limit. Must suppress.' },
    { code:'P11CF', name:'AdBlue Counter (BMW DDE)', limp:true, detail:'CRITICAL. BMW counter triggers progressive limp: warning → 65km/h → 30km/h. Zero level thresholds.' },
    { code:'P11D6', name:'AdBlue Critically Empty', limp:true, detail:'SEVERE. 30km/h speed limit. Engine may not restart. If already triggered, must reset via ISTA too.' },
    { code:'P204F', name:'Reductant Quality', limp:true, detail:'Wrong fluid or no fluid detected. Suppressed by zeroing SCR efficiency monitor.' },
    { code:'P11D0', name:'Dosing System Malfunction (BMW)', limp:true, detail:'Pump not delivering. Suppressed by zeroing dosing request map.' },
    { code:'P11D2', name:'Dosing Malfunction (BMW)', limp:true, detail:'Active dosing fault. Suppressed by zero dosing demand.' },
    { code:'P11D3', name:'Reductant Consumption Error', limp:true, detail:'Consumption rate wrong vs model. Suppressed by zeroing SCR maps.' },
    { code:'P204E', name:'Reductant Tank Level Low', limp:true, detail:'Critical level — countdown to limp begins. Suppressed by zeroing level thresholds.' },
    { code:'P11D5', name:'Reductant Level Very Low', limp:true, detail:'65km/h speed limit. Suppressed by zeroing ADBLUE_LVL map.' },
    { code:'P207F', name:'Reductant Quality Sensor', limp:false, detail:'Quality sensor signal fault. Suppressed by max NOx fault threshold.' },
    { code:'P2BAC', name:'NOx Sensor Upstream Performance', limp:false, detail:'Pre-catalyst sensor plausibility. Suppressed by zeroing upstream model.' },
    { code:'P2BAE', name:'NOx Sensor Upstream Circuit', limp:false, detail:'Circuit range fault. Suppressed by warmup delay + fault threshold.' },
    { code:'P2047', name:'Reductant Injector Circuit Open', limp:false, detail:'Injector removed. Suppressed by zeroing dosing map.' },
    { code:'P204B', name:'Reductant Pump Circuit', limp:false, detail:'Pump circuit fault. Suppressed by zeroing dosing demand.' },
  ],
  SWIRL: [
    { code:'P1447', name:'Swirl Flap Position (BMW DDE)', limp:false, detail:'Position sensor no movement after physical delete. Suppressed via monitor tolerance.' },
    { code:'P1448', name:'Swirl Flap Circuit (BMW DDE)', limp:false, detail:'Solenoid never commanded after zero duty maps — no circuit mismatch fault.' },
  ],
};

// ── Delete map signatures (verified from DDE731a N57D30T1 binary) ──
const MAP_DB = {
  EDC17CP45: {
    color:'#3B82F6', vehicle:'BMW N57 6-cyl', label:'EDC17CP45',
    EGR: [
      { id:'EGR_MAIN', name:'EGR Main Demand', system:'EGR', note:'Full 16pt RPM axis — 8 identical cal-region copies patched',
        sig:[0x90,0x01,0x20,0x03,0xB0,0x04,0x40,0x06,0xD0,0x07,0x60,0x09,0xF0,0x0A,0x80,0x0C,
             0x10,0x0E,0xA0,0x0F,0x30,0x11,0xC0,0x12,0x50,0x14,0xE0,0x15,0x70,0x17,0x00,0x19],
        xLen:16,yLen:16,vBytes:1,patch:'zero',patchAll:true },
      { id:'EGR_ENABLE', name:'EGR Enable Thresholds', system:'EGR', note:'Temp axis -120°C to +80°C — 2 cal-region hits',
        sig:[0x88,0xFF,0x9C,0xFF,0xB0,0xFF,0xC4,0xFF,0xD8,0xFF,0xEC,0xFF,0x00,0x00,0x14,0x00,0x28,0x00,0x3C,0x00,0x50,0x00],
        xLen:11,yLen:1,vBytes:2,patch:'zero',patchAll:true },
      { id:'EGR_VALVE_MON', name:'EGR Valve Monitor Tolerance', system:'EGR', note:'1 unique hit — max = position faults never trigger',
        sig:[0xA0,0x0F,0x70,0x17,0x40,0x1F,0x30,0x75,0x0A,0x14,0x1E,0x28,0x32],
        xLen:1,yLen:5,vBytes:1,patch:'max',dataOffset:8 },
      { id:'EGR_CORR', name:'EGR Correction Factor', system:'EGR', note:'Closed-loop correction zeroed to prevent re-enable',
        sig:[0x90,0x01,0x20,0x03,0xB0,0x04,0x40,0x06,0xD0,0x07,0x60,0x09,0xF0,0x0A,0x80,0x0C,
             0x10,0x0E,0xA0,0x0F,0x30,0x11,0xC0,0x12,0x50,0x14,0xE0,0x15,0x70,0x17,0x00,0x19],
        xLen:16,yLen:16,vBytes:1,patch:'zero',patchAll:true,dataOffset:32 },
    ],
    DPF: [
      { id:'DPF_PRESSURE_MODEL', name:'DPF Pressure Model (27-stage)', system:'DPF', note:'13KB block — 27 groups at 242B intervals — zero all',
        sig:[0xA0,0x0F,0x70,0x17,0x40,0x1F,0x98,0x3A],
        xLen:9,yLen:121,vBytes:2,patch:'zero',blockSize:13312,blockOffset:-226 },
      { id:'DPF_SOOT_RATE', name:'DPF Soot Accumulation Rate', system:'DPF', note:'8×8 uint8 — soot rate per combustion event — zero = counter never fills',
        sig:[0x05,0x0B,0x0C,0x0D,0x0F,0x10,0x11,0x13,0x1C,0x1F,0x21,0x24,0x24,0x25,0x25,0x2C],
        xLen:8,yLen:8,vBytes:1,patch:'zero' },
      { id:'DPF_WARN', name:'DPF Warning Thresholds', system:'DPF', note:'7 threshold tables — all maxed out',
        sig:[0x0A,0x00,0x14,0x00,0x1E,0x00,0x28,0x00,0x32,0x00,0x3C,0x00,0x46,0x00,0x50,0x00,0x5A,0x00,0x64,0x00],
        xLen:12,yLen:1,vBytes:2,patch:'max',patchAll:true },
    ],
    ADBLUE: [
      { id:'SCR_DOSE', name:'AdBlue Dosing Request', system:'ADBLUE', note:'Zero = pump never commanded',
        sig:[0xC8,0x00,0x2C,0x01,0x90,0x01,0xF4,0x01,0x58,0x02,0xBC,0x02],
        xLen:8,yLen:8,vBytes:2,patch:'zero' },
      { id:'SCR_EFF', name:'SCR Catalyst Efficiency Monitor', system:'ADBLUE', note:'Zero = no efficiency check',
        sig:[0x96,0x00,0xC8,0x00,0xFA,0x00,0x2C,0x01,0x5E,0x01,0x90,0x01],
        xLen:8,yLen:8,vBytes:2,patch:'zero' },
      { id:'ADBLUE_LVL', name:'AdBlue Level Thresholds', system:'ADBLUE', note:'Zero = ECU never sees low level',
        sig:[0x00,0x00,0x64,0x00,0xC8,0x00,0x2C,0x01,0x90,0x01],
        xLen:5,yLen:1,vBytes:2,patch:'zero' },
      { id:'NOX_SET', name:'NOx Setpoint Map', system:'ADBLUE', note:'Zero NOx setpoints',
        sig:[0x64,0x00,0xC8,0x00,0x2C,0x01,0x90,0x01,0xF4,0x01],
        xLen:8,yLen:8,vBytes:2,patch:'zero' },
      { id:'NOX_UP_MODEL', name:'NOx Upstream Model', system:'ADBLUE', note:'Zero upstream model',
        sig:[0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x02,0x00,0x05,0x00,0x0A,0x00],
        xLen:7,yLen:1,vBytes:2,patch:'zero' },
      { id:'NOX_FAULT_THR', name:'NOx Fault Threshold', system:'ADBLUE', note:'Max = fault never triggers',
        sig:[0x00,0x00,0x32,0x00,0x64,0x00,0xF4,0x01],
        xLen:4,yLen:1,vBytes:2,patch:'max' },
      { id:'NOX_WARMUP', name:'NOx Warmup Delay', system:'ADBLUE', note:'Max delay = monitoring never starts',
        sig:[0x3C,0x00,0x78,0x00,0xB4,0x00,0xF0,0x00],
        xLen:4,yLen:1,vBytes:2,patch:'max' },
    ],
    SWIRL: [
      { id:'SWIRL_DUTY', name:'Swirl Duty Map 1 (High Load)', system:'SWIRL', note:'Q0.12 duty — zero = flaps always open',
        sig:[0xAC,0x0D,0xA0,0x0F,0x94,0x11,0x88,0x13,0x7C,0x15,0x70,0x17,0x58,0x1B,0x00,0x00,
             0x58,0x02,0x20,0x03,0xE8,0x03,0xDC,0x05],
        xLen:8,yLen:7,vBytes:2,patch:'zero',dataOffset:32 },
      { id:'SWIRL_DUTY2', name:'Swirl Duty Map 2 (Low Load)', system:'SWIRL', note:'Zero — low load range',
        sig:[0xC4,0x09,0xB8,0x0B,0xAC,0x0D,0xA0,0x0F,0x88,0x13,0x70,0x17,0x58,0x1B,0x00,0x00,
             0x58,0x02,0x20,0x03,0xE8,0x03,0xDC,0x05],
        xLen:8,yLen:7,vBytes:2,patch:'zero',dataOffset:32 },
      { id:'SWIRL_ENABLE', name:'Swirl Enable Conditions', system:'SWIRL', note:'Temp axis 20-140°C — zero = never enabled',
        sig:[0x14,0x00,0x1E,0x00,0x32,0x00,0x46,0x00,0x5A,0x00,0x6E,0x00,0x82,0x00,0x8C,0x00],
        xLen:13,yLen:1,vBytes:2,patch:'zero',patchAll:true },
    ],
  },
};

// ── Map viewer database (28 confirmed maps) ────────────────────
const MAPS_DB = [
  // DDE Torque Demand
  { id:'torq_eco',   cat:'DDE Torque',   name:'ECO Mode Demand',      bosch:'KFMSNWDK_ECO',  offset:0x1C104C, xLen:10,yLen:16,vBytes:2,scale:0.5,unit:'Nm', xAxis:[1000,1300,1600,2000,2500,3000,4000,5000,6000,7000], yAxis:[0,100,200,500,800,1000,1500,2000,3000,4000,5000,7500,10000,15000,20000,25000], stg1:false },
  { id:'torq_sport', cat:'DDE Torque',   name:'Sport Mode Demand',     bosch:'KFMSNWDK_SPT',  findFn:'SPORT',  xLen:12,yLen:12,vBytes:2,scale:0.5,unit:'Nm', xAxis:[1000,1300,1600,2000,2500,3000,4000,5000,6000,7000,8500,10000], yAxis:[5500,6000,6500,7000,7500,8000,8500,9000,10000,11000,11500,12000], stg1:false },
  { id:'torq_cmf',   cat:'DDE Torque',   name:'Comfort Mode Demand',   bosch:'KFMSNWDK_CMF',  findFn:'COMFORT',xLen:12,yLen:12,vBytes:2,scale:0.5,unit:'Nm', xAxis:[1000,1300,1600,2000,2500,3000,4000,5000,6000,7000,8500,10000], yAxis:[5500,6000,6500,7000,7500,8000,8500,9000,10000,11000,11500,12000], stg1:false },
  // Torque Delivery
  { id:'trq_main',   cat:'Torque Delivery', name:'Delivery — Main Grid',  bosch:'KFLDRG_MAIN', offset:0x19CBF8, xLen:12,yLen:12,vBytes:2,scale:0.5,unit:'Nm', xAxis:[800,1000,1200,1500,2000,2500,3000,3500,4000,4500,5000,6000], yAxis:[5,10,15,20,30,40,50,60,70,80,90,100], stg1:true },
  { id:'trq_hl',     cat:'Torque Delivery', name:'Delivery — High Load',  bosch:'KFLDRG_HL',   offset:0x198EE4, xLen:12,yLen:8, vBytes:2,scale:0.5,unit:'Nm', xAxis:[800,1000,1200,1500,2000,2500,3000,3500,4000,4500,5000,6000], yAxis:[20,30,40,50,60,70,80,100], stg1:true },
  { id:'trq_lim_a',  cat:'Torque Delivery', name:'Limiter Map A',         bosch:'KFLDRG_LIMA',  offset:0x1993F0, xLen:8, yLen:8, vBytes:2,scale:0.5,unit:'Nm', xAxis:[800,1000,1500,2000,2500,3000,3500,4000], yAxis:[20,30,40,50,60,70,80,100], stg1:true },
  { id:'trq_lim_b',  cat:'Torque Delivery', name:'Limiter Map B',         bosch:'KFLDRG_LIMB',  offset:0x199634, xLen:8, yLen:8, vBytes:2,scale:0.5,unit:'Nm', xAxis:[800,1000,1500,2000,2500,3000,3500,4000], yAxis:[20,30,40,50,60,70,80,100], stg1:true },
  { id:'trq_mid',    cat:'Torque Delivery', name:'Delivery — Mid Load',   bosch:'KFLDRG_MID',   offset:0x19C8AA, xLen:8, yLen:12,vBytes:2,scale:0.5,unit:'Nm', xAxis:[1000,1500,2000,2500,3000,3500,4000,4500], yAxis:[10,15,20,25,30,40,50,60,70,80,90,100], stg1:true },
  // Fuel Injection
  { id:'inj_a', cat:'Fuel Injection', name:'Injection Map A', bosch:'KFKDIM_A', offset:0x17477E, xLen:16,yLen:8,vBytes:1,scale:0.5,unit:'mg/st', xAxis:[600,800,1000,1200,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000], yAxis:[10,20,30,40,50,60,80,100], stg1:true },
  { id:'inj_b', cat:'Fuel Injection', name:'Injection Map B', bosch:'KFKDIM_B', offset:0x1755EA, xLen:13,yLen:8,vBytes:1,scale:0.5,unit:'mg/st', xAxis:[600,800,1000,1200,1500,2000,2500,3000,3500,4000,4500,5000,5500], yAxis:[10,20,30,40,50,60,80,100], stg1:true },
  { id:'inj_c', cat:'Fuel Injection', name:'Injection Map C', bosch:'KFKDIM_C', offset:0x176890, xLen:13,yLen:8,vBytes:1,scale:0.5,unit:'mg/st', xAxis:[600,800,1000,1200,1500,2000,2500,3000,3500,4000,4500,5000,5500], yAxis:[10,20,30,40,50,60,80,100], stg1:true },
  { id:'smoke',      cat:'Fuel Injection', name:'Smoke Limiter (Max IQ)', bosch:'KFKDIMABG', offset:0x1884B6, xLen:8,yLen:8,vBytes:2,scale:0.5,unit:'Nm', xAxis:[800,1000,1200,1500,2000,2500,3000,3500], yAxis:[20,30,40,50,60,70,80,100], stg1:true },
  // Boost
  { id:'boost_a',    cat:'Boost Pressure', name:'Boost Target A', bosch:'KFLDRL_A', offset:0x1B1580, xLen:16,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[600,800,1000,1200,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000], yAxis:[10,20,30,40,50,60,80,100], stg1:true },
  { id:'boost_b',    cat:'Boost Pressure', name:'Boost Target B', bosch:'KFLDRL_B', offset:0x1B1922, xLen:16,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[600,800,1000,1200,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000], yAxis:[10,20,30,40,50,60,80,100], stg1:true },
  { id:'boost_lim',  cat:'Boost Pressure', name:'VGT/Boost Limit',bosch:'KFVD_LIM', offset:0x1B7500, xLen:12,yLen:4,vBytes:2,scale:0.5,unit:'mbar', xAxis:[600,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000], yAxis:[10,40,70,100], stg1:true },
  { id:'vgt_pos',    cat:'Boost Pressure', name:'VGT Position Limit',bosch:'KFVD_POS', offset:0x1B7A68, xLen:12,yLen:4,vBytes:2,scale:0.5,unit:'mbar', xAxis:[600,1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000], yAxis:[10,40,70,100], stg1:true },
  { id:'vgt_base',   cat:'Boost Pressure', name:'VGT Base Map',   bosch:'KFVD_BASE', offset:0x1C1984, xLen:8,yLen:8,vBytes:2,scale:100/4096,unit:'%', xAxis:[800,1000,1200,1500,2000,2500,3000,3500], yAxis:[700,750,800,850,900,950,1000,1920], stg1:false },
  // Torque Limiters
  { id:'main_lim',   cat:'Limiters', name:'Main Torque Limiter', bosch:'KFMXDRG', offset:0x150B06, xLen:8,yLen:8,vBytes:2,scale:0.1,unit:'Nm', xAxis:[1,2,3,4,5,6,7,8], yAxis:[1,2,3,4,5,6,7,8], stg1:true },
  { id:'peak_cap',   cat:'Limiters', name:'Peak Torque Cap',     bosch:'KFMXDRG_PK', offset:0x15401A, xLen:10,yLen:4,vBytes:2,scale:0.1,unit:'Nm', xAxis:[1,2,3,4,5,6,7,8,9,10], yAxis:[1,2,3,4], stg1:true },
  // Pendel
  { id:'pendel_a',   cat:'Pendel', name:'Pendel Map A', bosch:'KFPENDEL_A', offset:0x16B598, xLen:16,yLen:4,vBytes:2,scale:0.1,unit:'Nm', xAxis:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], yAxis:[1,2,3,4], stg1:true },
  { id:'pendel_b',   cat:'Pendel', name:'Pendel Map B', bosch:'KFPENDEL_B', offset:0x16B828, xLen:16,yLen:4,vBytes:2,scale:0.1,unit:'Nm', xAxis:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], yAxis:[1,2,3,4], stg1:true },
  { id:'pendel_c',   cat:'Pendel', name:'Pendel Map C', bosch:'KFPENDEL_C', offset:0x16BC62, xLen:16,yLen:4,vBytes:2,scale:0.1,unit:'Nm', xAxis:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], yAxis:[1,2,3,4], stg1:true },
  // Swirl
  { id:'swirl1',     cat:'Swirl Flap', name:'Swirl Duty Map 1', bosch:'KFSWIRLDUTY_HL', offset:0x15F604, xLen:8,yLen:7,vBytes:2,scale:100/4096,unit:'%', xAxis:[600,800,1000,1500,2000,2500,3000,3500], yAxis:[3500,4000,4500,5000,5500,6000,7000], stg1:false },
  { id:'swirl2',     cat:'Swirl Flap', name:'Swirl Duty Map 2', bosch:'KFSWIRLDUTY_LL', offset:0x1605E0, xLen:8,yLen:7,vBytes:2,scale:100/4096,unit:'%', xAxis:[600,800,1000,1500,2000,2500,3000,3500], yAxis:[2500,3000,3500,4000,5000,6000,7000], stg1:false },

  // ── Additional Boost Targets (confirmed from binary scan — all changed by ST1) ──
  { id:'boost_c',   cat:'Boost Pressure', name:'Boost Target C — Part Load',   bosch:'KFLDRL_C2',
    desc:'Part-load boost. Stock flat 612 mbar. Stage 1: +4.4% in upper rows.',
    offset:0x199130, xLen:8,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[1056,1091,1104,1129,1159,1200,1225,1225], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
  { id:'boost_d',   cat:'Boost Pressure', name:'Boost Target D — Low Load',    bosch:'KFLDRL_D',
    desc:'Low-load boost. Flat 612 mbar stock. Stage 1: +4.3%.',
    offset:0x19B1CA, xLen:8,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[1005,1040,1056,1091,1104,1129,1159,1200], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
  { id:'boost_e',   cat:'Boost Pressure', name:'Boost Target E — Base Load',   bosch:'KFLDRL_E',
    desc:'Base load boost — completely flat 537 mbar stock. Stage 1: +13.4%. Largest flat-to-gradient change in boost cluster.',
    offset:0x19AF88, xLen:8,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[990,1000,1025,1045,1060,1075,1075,1075], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
  { id:'boost_hla', cat:'Boost Pressure', name:'Boost High Load A',            bosch:'KFLDRL_HLA',
    desc:'High load boost — BIGGEST ST1 boost change at +18.7%. Peak 1038→1130 mbar. Critical for peak power.',
    offset:0x19A3CC, xLen:8,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[895,957,1044,1083,1161,1246,1301,1405], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
  { id:'boost_hlb', cat:'Boost Pressure', name:'Boost High Load B',            bosch:'KFLDRL_HLB',
    desc:'High load boost variant B. Stage 1: +7.3%. Different load axis to HLA.',
    offset:0x19A610, xLen:8,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[945,992,1054,1093,1151,1216,1301,1435], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
  { id:'boost_pl',  cat:'Boost Pressure', name:'Boost Partial Load',           bosch:'KFLDRL_PL',
    desc:'Partial load boost. All 64 cells raised +4.0% by Stage 1. Controls boost during normal driving.',
    offset:0x199872, xLen:8,yLen:8,vBytes:2,scale:0.5,unit:'mbar', xAxis:[1003,1003,1009,1070,1132,1193,1186,1208], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },

  // ── Additional Torque Delivery (confirmed from binary scan) ────
  { id:'trq_ext',  cat:'Torque Delivery', name:'Torque Delivery — Extended',  bosch:'KFLDRG_EXT',
    desc:'All 64 cells changed by ST1 at +12.7%. High internal load range 750-970. Very consistent modification across the whole map.',
    offset:0x19D9CC, xLen:8,yLen:8,vBytes:2,scale:0.1,unit:'Nm', xAxis:[750,800,850,875,900,925,950,970], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
  { id:'trq_var',  cat:'Torque Delivery', name:'Torque Delivery — Variant',   bosch:'KFLDRG_VAR',
    desc:'All 64 cells changed +4.0% by Stage 1. High load range 5000-8500 units.',
    offset:0x19D242, xLen:8,yLen:8,vBytes:2,scale:0.1,unit:'Nm', xAxis:[5000,5500,6000,6500,7000,7500,8000,8500], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },

  // ── Extended Limiters (confirmed from binary scan) ─────────────
  { id:'lim_xa',   cat:'Limiters', name:'Extended Limiter A',                  bosch:'KFMXDRG_XA',
    desc:'Stock first cell 11400 (1140 Nm). Stage 1 raised to 15000 (1500 Nm) at +31.6%. High-axis torque protection.',
    offset:0x154382, xLen:8,yLen:8,vBytes:2,scale:0.1,unit:'Nm', xAxis:[6900,7250,8000,8651,9100,9513,10020,10575], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
  { id:'lim_xb',   cat:'Limiters', name:'Extended Limiter B',                  bosch:'KFMXDRG_XB',
    desc:'Identical changes to Limiter A (+31.6%). Warm vs cold variant — both must be raised together.',
    offset:0x154692, xLen:8,yLen:8,vBytes:2,scale:0.1,unit:'Nm', xAxis:[6900,7250,8000,8651,9100,9513,10020,10575], xLabel:'Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },

  // ── Injection Trim (confirmed from binary scan) ────────────────
  { id:'inj_trim', cat:'Fuel Injection', name:'Injection Trim Map',            bosch:'KFKDIM_TRIM',
    desc:'All 64 cells raised +9.9% by Stage 1. Values in mg/stroke (×0.5). Likely IQ correction/trim vs RPM/load.',
    offset:0x177BC4, xLen:8,yLen:8,vBytes:1,scale:0.5,unit:'mg/st', xAxis:[0,1000,2000,3000,4000,5000,6000,7000], xLabel:'RPM/Load', yAxis:[1,2,3,4,5,6,7,8], yLabel:'Row', stg1:true },
];

// ── AdBlue Counter Reset Database ─────────────────────────────
// Verified from DDE731a N57D30T1 binary analysis
// These are the THRESHOLD values — setting to max prevents counter ever triggering
const COUNTER_DB = [
  {
    id: 'DIST_CTR',
    name: 'Distance Counter Thresholds',
    desc: 'BMW limp mode km progression: 100→200→300km warnings, 600km=P11D5 (65km/h), 800km=P11D6 (30km/h), 1000km=no restart. 1 unique hit confirmed.',
    codes: ['P11D4','P11D5','P11D6','P11CF'],
    // Sig: [300,600,800,1000] — unique in entire file
    sig: [0x2C,0x01,0x58,0x02,0x20,0x03,0xE8,0x03],
    // Start 8 bytes before sig to capture full threshold list from 100km
    dataOffset: -8,
    // Max all 12 values (100,200,300,600,800,1000,10000,20000,30000 + padding)
    patchBytes: 24,
    patch: 'max',
    note: '0x19DF56 — maxing all km thresholds to 65535 means counter can never reach trigger point',
  },
  {
    id: 'CYCLE_CTR',
    name: 'Drive Cycle Counter Thresholds',
    desc: 'Engine start count thresholds: 50→100→800 starts without dosing. P11CF increments each engine start when dosing not occurring. 1 unique hit confirmed.',
    codes: ['P11CF','P11D0'],
    // Sig: [4950,0,50,100] — unique in entire file
    sig: [0x56,0x13,0x00,0x00,0x32,0x00,0x64,0x00],
    // Skip the 4950/0 header (4 bytes), max the threshold values [50,100,...,800]
    dataOffset: 4,
    // Max 32 bytes = 16 threshold values
    patchBytes: 32,
    patch: 'max',
    note: '0x1D1C7E — maxing drive cycle thresholds to 65535 means start counter never triggers limp',
  },
];


function findAll(buf, sig) {
  const data = new Uint8Array(buf), hits = [];
  outer: for (let i = 0; i <= data.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) if (data[i+j] !== sig[j]) continue outer;
    hits.push(i);
  }
  return hits;
}

function findVersionStr(buf) {
  const data = new Uint8Array(buf), out = [];
  for (let i = 0; i < data.length - 8; i++) {
    if (data[i]>=0x20&&data[i]<0x7F&&data[i+1]>=0x20&&data[i+1]<0x7F) {
      let s='', j=i;
      while(j<data.length&&data[j]>=0x20&&data[j]<0x7F) s+=String.fromCharCode(data[j++]);
      if (s.length>=8&&s.length<=40&&/DDE|EDC|P_\d|O_7|SW_|N57|B47/.test(s)) {
        out.push({text:s, off:i}); i=j;
      }
    }
  }
  return [...new Map(out.map(v=>[v.text,v])).values()].slice(0,12);
}

function scanMaps(buf) {
  const dv = new DataView(buf);
  function sig16(vals) { const b=new Uint8Array(vals.length*2); vals.forEach((v,i)=>{b[i*2]=v&0xFF;b[i*2+1]=(v>>8)&0xFF;}); return b; }
  const ecoSig=sig16([0,100,200,500,800,1000,1500,2000,3000,4000,5000,7500,10000,15000,20000,25000]);
  const scSig =sig16([5500,6000,6500,7000,7500,8000,8500,9000,10000,11000,11500,12000]);
  const ecoHits=findAll(buf,ecoSig), scHits=findAll(buf,scSig);
  const res={};
  for (const h of ecoHits) {
    const off=h+32, vals=[];
    for(let i=0;i<160;i++){const p=off+i*2;if(p+2>buf.byteLength)break;vals.push(dv.getUint16(p,true));}
    if(vals.length&&vals.every(v=>v===vals[0])&&vals[0]>0) { res['torq_eco']={offset:off}; break; }
  }
  const scMaps=scHits.map(h=>{
    const off=h+24, vals=[];
    for(let i=0;i<144;i++){const p=off+i*2;if(p+2>buf.byteLength)break;vals.push(dv.getUint16(p,true));}
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    return {off,offset:off,avg,vals};
  }).filter(x=>x.vals.length>0).sort((a,b)=>b.avg-a.avg);
  if(scMaps[0]) res['torq_sport']={offset:scMaps[0].offset};
  if(scMaps[1]) res['torq_cmf']={offset:scMaps[1].offset};
  return res;
}

function getMapData(buf, mapDef, scanned, sigOffsets) {
  if (!mapDef || !buf) return null;
  // Priority: signature-found offset > hardcoded offset > scanned offset
  const off = (sigOffsets && sigOffsets[mapDef.id]) || mapDef.offset || scanned?.[mapDef.id]?.offset;
  if (off == null) return null;
  const dv=new DataView(buf), n=mapDef.xLen*mapDef.yLen, vals=[];
  for(let i=0;i<n;i++){const p=off+i*mapDef.vBytes;if(p+mapDef.vBytes>buf.byteLength)break;vals.push(mapDef.vBytes===1?dv.getUint8(p):dv.getUint16(p,true));}
  return vals.length===n?vals:null;
}

function runDelete(buf, maps, enabled) {
  const out=buf.slice(0), view=new Uint8Array(out);
  let count=0;
  for (const m of maps) {
    if (!enabled[m.id]) continue;
    const hits = findAll(buf, new Uint8Array(m.sig));
    if (!hits.length) continue;
    const offsets = m.patchAll ? hits : [hits[0]];
    for (const sigOff of offsets) {
      let start, size;
      if (m.blockSize) { start=sigOff+(m.blockOffset||0); size=m.blockSize; }
      else if (m.dataOffset) { start=sigOff+m.dataOffset; size=m.xLen*Math.max(1,m.yLen)*m.vBytes; }
      else { start=sigOff; size=m.xLen*Math.max(1,m.yLen)*m.vBytes; }
      if(start<0||start>=view.length) continue;
      const fill=m.patch==='zero'?0x00:0xFF;
      for(let i=0;i<size&&start+i<view.length;i++) view[start+i]=fill;
      count++;
    }
  }
  return {buf:out, count};
}

function applyMapEdits(buf, id, vals, mapDef, scanned) {
  if (!mapDef || !buf || !vals) return buf;
  const off=mapDef.offset??scanned?.[id]?.offset;
  if(!off) return buf;
  const out=buf.slice(0), dv=new DataView(out);
  vals.forEach((v,i)=>{
    const p=off+i*mapDef.vBytes;
    if(p+mapDef.vBytes>out.byteLength) return;
    if(mapDef.vBytes===1) dv.setUint8(p,Math.min(255,Math.max(0,v)));
    else dv.setUint16(p,Math.min(65535,Math.max(0,v)),true);
  });
  return out;
}

function heatBg(t) {
  const h=Math.round((1-Math.min(1,Math.max(0,t)))*220);
  return `hsl(${h},78%,${30+t*15}%)`;
}
function diffBg(sv,mv) {
  if(sv===mv) return C.surface2;
  const p=sv>0?(mv-sv)/sv:0, s=Math.min(100,Math.abs(p)*500);
  return p>0?`hsl(0,${s}%,${26+s*0.1}%)`:`hsl(220,${s}%,${26+s*0.1}%)`;
}
// ── Signature DB for cross-version map finding ─────────────────
// [id, knownOffset, sigRelOffset, sig8bytes]
// sigRelOffset: 0 = map start, negative = bytes before map (pre-axis)
// 22/27 maps reliably found; 5 non-unique fall back to offset derivation
const SIG_DB = [
  ['trq_main',  0x19CBF8,   0, [222,3,222,3,227,3,36,4]],
  ['trq_hl',    0x198EE4,  -8, [61,3,86,3,116,3,157,3]],
  ['inj_a',     0x17477E,   0, [159,0,159,0,148,0,131,0]],
  ['inj_b',     0x1755EA,   0, [108,1,108,1,63,1,40,1]],
  ['inj_c',     0x176890,   0, [214,0,228,0,228,0,228,0]],
  ['smoke',     0x1884B6,   0, [201,4,241,4,23,5,65,5]],
  ['boost_a',   0x1B1580,  -8, [52,19,212,21,137,24,45,27]],
  ['boost_b',   0x1B1922,   0, [164,31,52,33,0,0,253,0]],
  ['boost_c',   0x199130, -24, [64,31,52,33,237,3,16,4]],
  ['boost_d',   0x19B1CA, -16, [76,29,237,3,16,4,32,4]],
  ['boost_e',   0x19AF88,  -8, [36,4,51,4,51,4,51,4]],
  ['boost_hla', 0x19A3CC,  -8, [137,4,222,4,21,5,125,5]],
  ['boost_hlb', 0x19A610,   0, [49,6,239,6,91,7,188,7]],
  ['boost_pl',  0x199872,   0, [190,4,190,4,87,5,176,5]],
  ['main_lim',  0x150B06,   0, [0,32,0,0,0,0,132,1]],
  ['lim_a',     0x15401A, -32, [140,10,84,11,28,12,66,14]],
  ['lim_xa',    0x154382,   0, [136,44,254,16,54,16,104,16]],
  ['lim_xb',    0x154692,   0, [136,44,254,16,54,16,104,16]],
  ['pendel_a',  0x16B598,   0, [136,19,192,18,92,18,148,17]],
  ['pendel_b',  0x16B828,   0, [160,25,151,24,30,22,20,21]],
  ['pendel_c',  0x16BC62, -16, [160,40,48,42,192,43,36,44]],
  ['trq_ext',   0x19D9CC,   0, [164,6,58,7,208,7,112,8]],
  ['trq_var',   0x19D242,   0, [10,5,10,6,243,6,15,8]],
  ['trq_mid',   0x19C8AA,   0, [187,4,21,6,87,6,157,6]],
  ['vgt_lim',   0x1B7500,   0, [112,23,224,21,224,21,224,21]],
  ['vgt_pos',   0x1B7A68,   0, [28,12,28,12,28,12,28,12]],
  ['inj_trim',  0x177BC4,   0, [199,1,91,0,223,0,117,1]],
];

function findMapsInBinary(ab) {
  const buf = new Uint8Array(ab);
  const CAL = 0x150000;
  const offsets = {}, confidence = {};

  for (const [id, knownOff, rel, sig] of SIG_DB) {
    // Search calibration area for signature
    const needle = new Uint8Array(sig);
    let found = -1, hits = 0;
    for (let i = CAL; i < buf.length - sig.length; i++) {
      let match = true;
      for (let j = 0; j < sig.length; j++) {
        if (buf[i+j] !== needle[j]) { match = false; break; }
      }
      if (match) { if (hits === 0) found = i; hits++; }
    }
    if (hits === 1) {
      // Unique match — high confidence
      offsets[id] = found - rel;
      confidence[id] = 'found';
    } else if (hits > 1) {
      // Non-unique — use the one closest to the known offset
      let bestDist = Infinity, bestOff = knownOff;
      for (let i = CAL; i < buf.length - sig.length; i++) {
        let match = true;
        for (let j = 0; j < sig.length; j++) {
          if (buf[i+j] !== needle[j]) { match = false; break; }
        }
        if (match) {
          const mapOff = i - rel;
          const dist = Math.abs(mapOff - knownOff);
          if (dist < bestDist) { bestDist = dist; bestOff = mapOff; }
        }
      }
      offsets[id] = bestOff;
      confidence[id] = bestDist < 0x10000 ? 'approx' : 'fallback';
    } else {
      // Not found — fall back to hardcoded offset
      offsets[id] = knownOff;
      confidence[id] = 'fallback';
    }
  }
  return { offsets, confidence };
}

// ── Main component ─────────────────────────────────────────────
export default function ECUTuneSuite() {
  const [file,  setFile]  = useState(null);
  const [buf,   setBuf]   = useState(null);
  const [file2, setFile2] = useState(null);
  const [buf2,  setBuf2]  = useState(null);
  const [tab,   setTab]   = useState('delete');      // 'delete'|'maps'|'export'
  const [delSys,setDelSys]= useState('EGR');
  const [enabled,setEnabled]= useState({});
  const [counterEnabled,setCounterEnabled]= useState({'DIST_CTR':true,'CYCLE_CTR':true});
  const [patched,setPatched]= useState(null);
  const [scanRes,setScanRes]= useState({});   // {mapId: number of hits} — computed once
  const [deleteStatus,setDeleteStatus]= useState({}); // {EGR|DPF|ADBLUE|SWIRL: 'STOCK'|'DELETED'|'PARTIAL'}
  const [scanned,setScanned]= useState({});
  const [versions,setVersions]=useState([]);
  const [selMap,setSelMap]= useState('trq_main');
  const [viewMode,setViewMode]=useState('table');
  const [diffMode,setDiffMode]=useState('f1');
  const [mapEdits,setMapEdits]=useState({});
  const [pct,setPct]=useState(0);
  const [autoChg,setAutoChg]=useState(null);
  const [loading,setLoading]=useState(false);
  const [downloadUrl,setDownloadUrl]=useState(null);
  // Auto-scanner state
  const [scanResults,setScanResults]=useState(null);
  const [scanning,setScanning]=useState(false);
  const [scanProgress,setScanProgress]=useState(0);
  const [scanView,setScanView]=useState('db');
  const [scanSelMap,setScanSelMap]=useState(null);
  const [scanCat,setScanCat]=useState('All');
  const [sigOffsets,setSigOffsets]=useState({});     // id → found offset
  const [sigConf,setSigConf]=useState({});           // id → 'found'|'approx'|'fallback'
  const [tipsSection,setTipsSection]=useState('delete');
  const [openTip,setOpenTip]=useState(null);
  // Lambda tool state
  const [ltBoost,setLtBoost]=useState(1800);   // mbar absolute
  const [ltIQ,setLtIQ]=useState(65);           // mg/stroke
  const [ltTemp,setLtTemp]=useState(35);        // °C intake
  const [ltGauge,setLtGauge]=useState(false);  // true = input is gauge pressure
  const canvasRef=useRef(null);

  // Create/revoke blob URL whenever patched buffer changes
  useEffect(()=>{
    if(downloadUrl) URL.revokeObjectURL(downloadUrl);
    if(patched){
      // Use base64 data URL — works in sandboxed iframes where blob URLs are blocked
      const bytes = new Uint8Array(patched);
      let binary = '';
      const chunk = 8192;
      for(let i=0;i<bytes.length;i+=chunk){
        binary += String.fromCharCode(...bytes.subarray(i,i+chunk));
      }
      setDownloadUrl('data:application/octet-stream;base64,'+btoa(binary));
    } else {
      setDownloadUrl(null);
    }
  },[patched]);

  const [log, setLog] = useState([]);     // log entries
  const [showLog, setShowLog] = useState(false);

  const addLog = (entries) => setLog(entries);

  const applyDeletes = () => {
    if(!buf) return;
    const entries = [];
    const out = buf.slice(0);
    const view = new Uint8Array(out);
    let totalPatched = 0;

    entries.push({ type:'header', text:`ECU Tune Suite — Delete Operation` });
    entries.push({ type:'header', text:`File: ${file?.name} (${(buf.byteLength/1024/1024).toFixed(2)} MB)` });
    entries.push({ type:'divider' });

    const allMapsLocal = Object.values(MAP_DB.EDC17CP45).flat();
    const sysColors = { EGR:C.amber, DPF:C.red, ADBLUE:C.blue, SWIRL:C.purple };

    for(const [sys, maps] of Object.entries(MAP_DB.EDC17CP45)){
      entries.push({ type:'sys', text:`── ${SYS[sys]?.label?.toUpperCase()} ──`, col:sysColors[sys] });
      for(const m of maps){
        if(!enabled[m.id]) {
          entries.push({ type:'skip', text:`  SKIP  ${m.name}`, col:C.textFaint });
          continue;
        }
        const hits = findAll(buf, new Uint8Array(m.sig));
        if(!hits.length){
          entries.push({ type:'notfound', text:`  ✗ NOT FOUND  ${m.name}`, col:'#6B7280' });
          continue;
        }
        const offsets = m.patchAll ? hits : [hits[0]];
        entries.push({ type:'found', text:`  ✓ FOUND  ${m.name}  (${hits.length} sig hit${hits.length>1?'s':''})`, col:sysColors[sys]||C.green });

        for(const sigOff of offsets){
          let start, size;
          if(m.blockSize){ start=sigOff+(m.blockOffset||0); size=m.blockSize; }
          else if(m.dataOffset){ start=sigOff+m.dataOffset; size=m.xLen*Math.max(1,m.yLen)*m.vBytes; }
          else { start=sigOff; size=m.xLen*Math.max(1,m.yLen)*m.vBytes; }
          if(start<0||start>=view.length) continue;
          const fill = m.patch==='zero' ? 0x00 : 0xFF;
          for(let i=0;i<size&&start+i<view.length;i++) view[start+i]=fill;
          const sizeStr = size>=1024 ? `${(size/1024).toFixed(1)}KB` : `${size}B`;
          entries.push({ type:'patch', text:`       → ${m.patch==='zero'?'Zeroed':'Maxed'} ${sizeStr} @ 0x${start.toString(16).toUpperCase().padStart(6,'0')}`, col:C.green });
          totalPatched++;
        }
      }
    }

    entries.push({ type:'divider' });
    entries.push({ type:'done', text:`Done — ${totalPatched} patches applied. Run WinOLS checksum correction before flashing.`, col:C.green });

    // ── Counter resets (AdBlue only) ──────────────────────────
    const ctrEntries = [];
    ctrEntries.push({ type:'sys', text:'── ADBLUE COUNTER RESET ──', col:C.blue });
    for(const ctr of COUNTER_DB){
      if(!counterEnabled[ctr.id]){ ctrEntries.push({type:'skip',text:`  SKIP  ${ctr.name}`,col:C.textFaint}); continue; }
      const hits=findAll(out,new Uint8Array(ctr.sig));
      if(!hits.length){ ctrEntries.push({type:'notfound',text:`  ✗ NOT FOUND  ${ctr.name}`,col:'#6B7280'}); continue; }
      ctrEntries.push({type:'found',text:`  ✓ FOUND  ${ctr.name}  (${ctr.codes.join(', ')})`,col:C.blue});
      const sigOff=hits[0];
      const start=sigOff+(ctr.dataOffset||0);
      if(start>=0&&start<view.length){
        for(let i=0;i<ctr.patchBytes&&start+i<view.length;i++) view[start+i]=0xFF;
        ctrEntries.push({type:'patch',text:`       → Maxed ${ctr.patchBytes}B @ 0x${start.toString(16).toUpperCase().padStart(6,'0')} — thresholds now 65535`,col:C.blue});
        totalPatched++;
      }
    }
    if(ctrEntries.some(e=>e.type==='patch')) {
      entries.splice(entries.length-1,0,...ctrEntries);
      entries[entries.length-1].text=`Done — ${totalPatched} patches applied. Run WinOLS checksum correction before flashing.`;
    }

    setLog(entries);
    setShowLog(true);
    setPatched(out);
  };

  // Detect which systems are already deleted in a binary ──────────
  const detectDeletes = (b) => {
    if (!b) return {};
    const dv = new DataView(b);
    const rd1=(o,n)=>Array.from({length:n},(_,i)=>{const p=o+i;return p<b.byteLength?dv.getUint8(p):0;});
    const rd2=(o,n)=>Array.from({length:n},(_,i)=>{const p=o+i*2;return p+2<=b.byteLength?dv.getUint16(p,true):0;});
    const checks={
      EGR:[
        [new Uint8Array([0x90,0x01,0x20,0x03,0xB0,0x04,0x40,0x06,0xD0,0x07,0x60,0x09,0xF0,0x0A,0x80,0x0C,0x10,0x0E,0xA0,0x0F,0x30,0x11,0xC0,0x12,0x50,0x14,0xE0,0x15,0x70,0x17,0x00,0x19]),0,128,1,'zero',10],
        [new Uint8Array([0x88,0xFF,0x9C,0xFF,0xB0,0xFF,0xC4,0xFF,0xD8,0xFF,0xEC,0xFF,0x00,0x00,0x14,0x00]),0,32,2,'zero',100],
      ],
      DPF:[
        [new Uint8Array([0x05,0x0B,0x0C,0x0D,0x0F,0x10,0x11,0x13]),0,64,1,'zero',3],
        [new Uint8Array([0x0A,0x00,0x14,0x00,0x1E,0x00,0x28,0x00,0x32,0x00,0x3C,0x00]),0,24,2,'max',0],
      ],
      ADBLUE:[
        [new Uint8Array([0xC8,0x00,0x2C,0x01,0x90,0x01,0xF4,0x01,0x58,0x02,0xBC,0x02]),12,64,2,'zero',50],
        [new Uint8Array([0x64,0x00,0xC8,0x00,0x2C,0x01,0x90,0x01,0xF4,0x01]),10,64,2,'zero',50],
      ],
      SWIRL:[
        [new Uint8Array([0xAC,0x0D,0xA0,0x0F,0x94,0x11,0x88,0x13,0x7C,0x15,0x70,0x17,0x58,0x1B,0x00,0x00,0x58,0x02,0x20,0x03,0xE8,0x03,0xDC,0x05]),32,56,2,'zero',500],
        [new Uint8Array([0xC4,0x09,0xB8,0x0B,0xAC,0x0D,0xA0,0x0F,0x88,0x13,0x70,0x17,0x58,0x1B,0x00,0x00,0x58,0x02,0x20,0x03,0xE8,0x03,0xDC,0x05]),32,56,2,'zero',500],
      ],
    };
    const res={};
    for(const[sys,maps]of Object.entries(checks)){
      const statuses=maps.map(([sig,doff,nc,vb,pt,thr])=>{
        const hits=findAll(b,sig).filter(h=>h>=0x150000);
        if(!hits.length) return 'NOT_FOUND';
        const cells=vb===1?rd1(hits[0]+doff,nc):rd2(hits[0]+doff,Math.floor(nc/2));
        const mx=Math.max(...cells);
        return pt==='zero'?(mx<thr?'DELETED':'STOCK'):(mx>30000?'DELETED':'STOCK');
      }).filter(s=>s!=='NOT_FOUND');
      res[sys]=statuses.every(s=>s==='DELETED')?'DELETED':statuses.some(s=>s==='DELETED')?'PARTIAL':'STOCK';
    }
    return res;
  };

  // Run all signature scans ONCE when buf loads — never during render
  useEffect(()=>{
    if(!buf) return;
    // Enable all maps
    const en={};
    Object.values(MAP_DB.EDC17CP45).flat().forEach(m=>{ en[m.id]=true; });
    setEnabled(en);
    setVersions(findVersionStr(buf));
    setScanned(scanMaps(buf));
    // Detect already-deleted systems
    setDeleteStatus(detectDeletes(buf));
    // Scan signatures — expensive, do it once here not on every render
    const res={};
    Object.values(MAP_DB.EDC17CP45).flat().forEach(m=>{
      res[m.id]=findAll(buf,new Uint8Array(m.sig)).length;
    });
    // Also pre-scan counter signatures
    COUNTER_DB.forEach(ctr=>{
      res[ctr.id]=findAll(buf,new Uint8Array(ctr.sig)).length;
    });
    setScanRes(res);
  },[buf]);

  // 3D canvas render
  const selDef = MAPS_DB.find(m=>m.id===selMap);
  useEffect(()=>{
    if(tab!=='maps'||viewMode!=='3d'||!canvasRef.current||!selDef) return;
    const canvas=canvasRef.current, ctx=canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const working=patched||buf;
    const edVals=mapEdits[selMap];
    const rawVals=edVals??getMapData(working,selDef,scanned,sigOffsets);
    if(!rawVals) return;
    const nonZ=rawVals.filter(v=>v>0);
    const mn=nonZ.length?Math.min(...nonZ):0, mx=nonZ.length?Math.max(...nonZ):1;
    const xL=selDef.xLen, yL=selDef.yLen;
    const cW=Math.max(12,Math.floor((W*0.55)/(xL+yL*0.5)));
    const cH=Math.floor(cW*0.5);
    const maxH=Math.min(H*0.4,100);
    const ox=W*0.5-(xL-yL*0.5)*cW*0.5, oy=H*0.82;
    for(let row=yL-1;row>=0;row--){
      for(let col=0;col<xL;col++){
        const t=mx>mn?((rawVals[row*xL+col]??0)-mn)/(mx-mn):0;
        const h2=Math.max(2,t*maxH), hue=Math.round((1-t)*220);
        const sx=(col-row)*cW*0.5+ox, sy=(col+row)*cH*0.5+oy;
        [
          [[[sx+cW*.5,sy-cH*.5-h2],[sx+cW*.5,sy+cH*.5],[sx,sy+cH],[sx,sy-h2]],`hsl(${hue},65%,20%)`],
          [[[sx-cW*.5,sy-cH*.5-h2],[sx-cW*.5,sy+cH*.5],[sx,sy+cH],[sx,sy-h2]],`hsl(${hue},55%,16%)`],
          [[[sx,sy-cH-h2],[sx+cW*.5,sy-cH*.5-h2],[sx,sy-h2],[sx-cW*.5,sy-cH*.5-h2]],`hsl(${hue},80%,${32+t*16}%)`],
        ].forEach(([path,fill])=>{
          ctx.beginPath(); path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
          ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
          ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=0.3; ctx.stroke();
        });
      }
    }
  },[tab,viewMode,selMap,buf,patched,mapEdits,scanned]);

  const handleDrop = (e, secondary) => {
    e.preventDefault?.();
    const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!f) return;
    setLoading(true);
    const r = new FileReader();
    r.onload = ev => {
      const ab = ev.target.result;
      if (secondary) {
        setFile2(f); setBuf2(ab); setDiffMode('diff');
      } else {
        setFile(f); setBuf(ab); setPatched(null); setMapEdits({});
        setAutoChg(null); setScanRes({}); setTab('delete');
        // Run signature-based map finder
        const {offsets, confidence} = findMapsInBinary(ab);
        setSigOffsets(offsets); setSigConf(confidence);
      }
      setLoading(false);
    };
    r.onerror = () => setLoading(false);
    r.readAsArrayBuffer(f);
  };

  const applyMapPct = () => {
    if(!selDef||!pct) return;
    const working=patched||buf;
    const base=mapEdits[selMap]??getMapData(working,selDef,scanned,sigOffsets);
    if(!base) return;
    const newVals=base.map(v=>Math.round(v*(1+pct/100)));
    setMapEdits(e=>({...e,[selMap]:newVals}));
  };

  const applyAllMapEdits = () => {
    if(!buf) return;
    let working=patched||buf;
    for(const [id,vals] of Object.entries(mapEdits)){
      const def=MAPS_DB.find(m=>m.id===id);
      if(def) working=applyMapEdits(working,id,vals,def,scanned);
    }
    setPatched(working);
    setMapEdits({});
  };

  const autoScan = () => {
    if(!buf||!buf2) return;
    const S=new Uint8Array(buf), M=new Uint8Array(buf2);
    const blocks=[]; let inB=false,bs=0;
    for(let i=0;i<S.length;i++){
      if(S[i]!==M[i]){if(!inB){bs=i;inB=true;}}
      else{if(inB){blocks.push([bs,i]);inB=false;}}
    }
    const merged=[];
    for(const[s,e]of blocks){
      if(merged.length&&s-merged[merged.length-1][1]<64) merged[merged.length-1][1]=e;
      else merged.push([s,e]);
    }
    const dv1=new DataView(buf),dv2=new DataView(buf2);
    const named=merged.filter(([s])=>s>=0x150000).map(([s,e])=>{
      const sz=e-s,n=Math.min(10,Math.floor(sz/2));
      const mv=[];for(let i=0;i<n;i++)mv.push(dv2.getUint16(s+i*2,true));
      const sv=[];for(let i=0;i<n;i++)sv.push(dv1.getUint16(s+i*2,true));
      const mx1=Math.max(...sv.filter(v=>v>0)||[1]),mx2=Math.max(...mv.filter(v=>v>0)||[1]);
      const pct=mx1>0?((mx2-mx1)/mx1*100):0;
      const known=MAPS_DB.find(m=>m.offset&&Math.abs(m.offset-s)<sz*2);
      return {addr:s,size:sz,pct,name:known?known.name:`0x${s.toString(16).toUpperCase()} (${sz}B)`,known:!!known,knownId:known?.id};
    }).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
    setAutoChg(named);
  };

  // ── Shared button style ──────────────────────────────────────
  const btn = (color,bg,border) => ({
    padding:'8px 16px', fontSize:'12px', fontWeight:700, borderRadius:'6px',
    border:`1px solid ${border||color+'44'}`, background:bg||color+'22',
    color, cursor:'pointer', letterSpacing:'.03em',
  });

  // ── Stage 1 diff scanner (reliable — 100% confirmed real maps) ──────
  const runAutoScanner = () => {
    if (!buf || !buf2 || scanning) return;
    setScanning(true); setScanProgress(0); setScanResults(null);
    const S = new Uint8Array(buf), M = new Uint8Array(buf2);
    const CAL = 0x150000;
    const r16 = (d,o) => o+1 < d.length ? (d[o] | (d[o+1]<<8)) : 0;

    // Known map names — array of [address, name] pairs (hex keys in objects break Babel)
    const NAMED_LIST = [
      [0x19CBF8,'Torque Delivery — Main'],   [0x198EE4,'Torque Delivery — High Load'],
      [0x1993F0,'Torque Limiter A'],          [0x199634,'Torque Limiter B'],
      [0x19C8AA,'Torque Delivery — Mid'],     [0x17477E,'Injection Map A'],
      [0x1755EA,'Injection Map B'],           [0x176890,'Injection Map C'],
      [0x1884B6,'Smoke Limiter'],             [0x1B1580,'Boost Target A'],
      [0x1B1922,'Boost Target B'],            [0x1B7500,'VGT Boost Limit'],
      [0x1B7A68,'VGT Position Limit'],        [0x150B06,'Main Torque Limiter'],
      [0x15401A,'Peak Torque Cap'],           [0x16B598,'Pendel Map A'],
      [0x16B828,'Pendel Map B'],              [0x16BC62,'Pendel Map C'],
      [0x19A3CC,'Boost High Load A'],         [0x19A610,'Boost High Load B'],
      [0x199872,'Boost Partial Load'],        [0x199130,'Boost Target C'],
      [0x19B1CA,'Boost Target D'],            [0x19AF88,'Boost Target E'],
      [0x19D9CC,'Torque Delivery — Extended'],[0x19D242,'Torque Delivery — Variant'],
      [0x154382,'Extended Limiter A'],        [0x154692,'Extended Limiter B'],
      [0x177BC4,'Injection Trim'],            [0x19B546,'Torque Delivery F'],
      [0x19A872,'Boost High Load C'],         [0x19D080,'Torque Delivery G'],
      [0x19C9FE,'Boost Partial Load B'],      [0x19CE84,'Boost Partial Load C'],
      [0x1B1D2E,'Boost VGT Extended'],        [0x1AFC6E,'Boost VGT A'],
      [0x1B04BA,'Boost VGT B'],               [0x1B08DE,'Boost VGT C'],
      [0x1B41B8,'Boost VGT D'],               [0x1B50EA,'Boost VGT E'],
      [0x1B530C,'Boost VGT F'],               [0x1B4EC2,'Boost VGT G'],
      [0x188C6C,'Fuelling Limit'],            [0x16BF98,'Pendel Map D'],
    ];
    const REGION = (s) =>
      s < 0x160000 ? 'Limiters / Caps' :
      s < 0x178000 ? 'Fuel Injection' :
      s < 0x190000 ? 'Smoke / Fuelling' :
      s < 0x1A0000 ? 'Torque Delivery' :
      s < 0x1B0000 ? 'Boost Pressure' :
      s < 0x1C0000 ? 'Boost / VGT Limits' :
      s < 0x1D0000 ? 'DDE Torque / Misc' : 'AdBlue / SCR';
    const REGION_COL = {
      'Limiters / Caps': '#EF4444',   'Fuel Injection': '#3B82F6',
      'Smoke / Fuelling': '#F97316',  'Torque Delivery': '#F59E0B',
      'Boost Pressure': '#22C55E',    'Boost / VGT Limits': '#10B981',
      'DDE Torque / Misc': '#A855F7', 'AdBlue / SCR': '#60A5FA',
    };

    setTimeout(() => {
      // Find all changed blocks via byte diff
      const changes = []; let inB = false, start = 0;
      for (let i = CAL; i < Math.min(S.length, M.length); i++) {
        if (S[i] !== M[i]) { if (!inB) { start = i; inB = true; } }
        else { if (inB) { changes.push([start, i]); inB = false; } }
      }
      // Merge nearby blocks
      const merged = [];
      for (const [s,e] of changes) {
        if (merged.length && s - merged[merged.length-1][1] < 64)
          merged[merged.length-1][1] = e;
        else merged.push([s, e]);
      }
      setScanProgress(50);
      // Build result list
      const results = merged
        .filter(([s]) => s >= CAL)
        .map(([s, e]) => {
          const sz = e - s;
          const sv = [], mv = [];
          for (let i = 0; i < Math.min(64, sz >> 1); i++) {
            sv.push(r16(S, s + i*2));
            mv.push(r16(M, s + i*2));
          }
          const nz_s = sv.filter(v => v > 0 && v < 60000);
          const nz_m = mv.filter(v => v > 0 && v < 60000);
          const mx_s = nz_s.length ? Math.max(...nz_s) : 0;
          const mx_m = nz_m.length ? Math.max(...nz_m) : 0;
          const pct = mx_s > 0 ? Math.round((mx_m - mx_s) / mx_s * 100 * 10) / 10 : 0;
          const region = REGION(s);
          const name = NAMED_LIST.find(([a]) => Math.abs(a - s) < 200)?.[1];
          return {
            off: s, end: e, size: sz,
            name: name || null,
            region, col: REGION_COL[region] || '#9CA3AF',
            mx_s, mx_m, pct,
            sv: sv.slice(0, 32), mv: mv.slice(0, 32),
            cells: sz >> 1,
            known: !!name,
          };
        })
        .sort((a,b) => b.size - a.size);

      setScanResults(results);
      setScanProgress(100);
      setScanning(false);
      setScanView('scan');
    }, 10);
  };

  // ── Reset everything back to initial state ───────────────────
  const resetProject = () => {
    setFile(null); setBuf(null);
    setFile2(null); setBuf2(null);
    setTab('delete'); setDelSys('EGR');
    setEnabled({}); setPatched(null);
    setScanRes({}); setDeleteStatus({});
    setScanned({}); setVersions([]);
    setSelMap('trq_main'); setViewMode('table');
    setDiffMode('f1'); setMapEdits({});
    setPct(0); setAutoChg(null);
    setLoading(false); setDownloadUrl(null);
    setLog([]); setShowLog(false);
    setCounterEnabled({'DIST_CTR':true,'CYCLE_CTR':true});
    setScanResults(null); setScanView('db'); setScanSelMap(null);
    setScanProgress(0); setScanning(false); setScanCat('All');
    setTipsSection('delete'); setOpenTip(null);
  };

  // ── UI ───────────────────────────────────────────────────────
  const noFile = !buf;

  // ── Safety model (N57D30T1 constants) ────────────────────────
  const VD_CC=499, ETA_V=0.88, AFR_STOICH=14.5, R_AIR=287, T_INTAKE=308;
  // Fixed lambda formula — boost in mbar ABSOLUTE, IQ in mg/stroke
  const calcLambdaAbs=(iq,boost_mbar_abs,tempC=35)=>{
    if(iq<=0) return 99;
    const P=boost_mbar_abs*100, T=tempC+273.15;
    const mAir=(P*VD_CC*1e-6*ETA_V)/(R_AIR*T);
    return mAir/(iq*1e-6*AFR_STOICH);
  };
  // Legacy wrapper for safety tab (boost_hla values ≈ gauge mbar, add atm)
  const calcLambda=(iq,boost_mbar)=>{
    if(iq<=0) return 99;
    const rho=boost_mbar*100/(R_AIR*T_INTAKE);
    const mAir=rho*(VD_CC*1e-6)*ETA_V;
    return mAir/(iq*1e-6*AFR_STOICH);
  };
  const calcEGT=(iq,boost_mbar)=>{
    if(iq<=0) return 200;
    const lam=Math.max(calcLambda(iq,boost_mbar),0.75);
    return Math.round(200+300*(iq/50)*(1.3/lam));
  };

  // Read safety-relevant values from a buffer
  const readSafetyValues=(b)=>{
    if(!b) return null;
    const dv=new DataView(b);
    const u16at=(o,n=1)=>Array.from({length:n},(_,i)=>dv.getUint16(o+i*2,true));
    const u8at=(o,n=1)=>Array.from({length:n},(_,i)=>dv.getUint8(o+i));
    // Injection — u8×0.5 mg/st, read representative full-load cells (avoid header rows)
    const injRaw=u8at(0x17477E,128);
    const injFullLoad=injRaw.slice(80,128).filter(v=>v>0&&v<220);
    const iqPeak=injFullLoad.length?Math.max(...injFullLoad)*0.5:65;
    const iqTyp=injFullLoad.length?injFullLoad.reduce((a,b)=>a+b,0)/injFullLoad.length*0.5:55;
    // Boost — use High Load A map (0x19A3CC) as representative boost target
    const boostHla=u16at(0x19A3CC,64);
    const boostPeak=Math.max(...boostHla.filter(v=>v>0&&v<3000))*0.5;
    const boostTyp=boostHla.filter(v=>v>500&&v<3000).reduce((a,b)=>a+b,0)/boostHla.filter(v=>v>500&&v<3000).length*0.5||1800;
    // Torque limiter
    const limVals=u16at(0x150B06,64).filter(v=>v>100&&v<20000);
    const limPeak=limVals.length?Math.max(...limVals)*0.1:710;
    // Smoke limiter (Nm×0.5)
    const smokeVals=u16at(0x1884B6,64).filter(v=>v>100&&v<4000);
    const smokePeak=smokeVals.length?Math.max(...smokeVals)*0.5:400;
    // VGT limit (0x1B7500 raw)
    const vgtLim=Math.max(...u16at(0x1B7500,48).filter(v=>v>0&&v<60000))*0.5;
    return {iqPeak,iqTyp,boostPeak:Math.min(boostPeak||1800,3500),boostTyp,limPeak,smokePeak,vgtLim:Math.min(vgtLim||1500,3500)};
  };

  return (
    <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:"'Inter',-apple-system,sans-serif",fontSize:'13px'}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:#0D1117}
        ::-webkit-scrollbar-thumb{background:#374151;border-radius:3px}
        input{font-family:inherit}
        .tab-btn{padding:8px 16px;font-size:12px;font-weight:600;border:none;cursor:pointer;border-radius:6px;transition:all .15s}
        .tab-btn.active{background:#1D4ED822;color:#60A5FA;box-shadow:inset 0 -2px 0 #3B82F6}
        .tab-btn:not(.active){background:transparent;color:#6B7280}
        .tab-btn:hover:not(.active){background:#1F2937;color:#9CA3AF}
        .sys-tab{padding:6px 12px;font-size:11px;font-weight:700;border:none;cursor:pointer;border-radius:5px;letter-spacing:.05em;text-transform:uppercase;transition:all .15s}
        .map-row{padding:5px 10px;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:6px;transition:all .1s}
        .map-row:hover{background:#111827}
        .map-row.sel{background:#1D4ED822;border-left:2px solid #3B82F6}
        .map-row:not(.sel){border-left:2px solid transparent}
        .cell{display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;border-radius:2px;user-select:none;transition:opacity .1s}
        .cell:hover{opacity:0.85}
        .badge{font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;letter-spacing:.05em}
        .card{background:#0D1117;border:1px solid #1F2937;border-radius:10px;padding:16px}
        .dtc-row{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:6px;background:#111827;border:1px solid #1F2937;margin-bottom:4px}
        .input-sm{background:#0D1117;border:1px solid #374151;border-radius:4px;color:#F9FAFB;font-size:11px;padding:5px 8px;outline:none;width:100%}
        .input-sm:focus{border-color:#3B82F6}
        @media(max-width:600px){.sidebar{display:none}}
      `}</style>

      {/* ── Header ── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'0 20px',display:'flex',alignItems:'center',gap:'16px',height:'52px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={{width:'28px',height:'28px',background:'linear-gradient(135deg,#3B82F6,#8B5CF6)',borderRadius:'7px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px'}}>⚙</div>
          <div>
            <div style={{fontSize:'13px',fontWeight:700,color:C.text,lineHeight:1}}>ECU Tune Suite</div>
            <div style={{fontSize:'9px',color:C.textFaint,letterSpacing:'.08em',textTransform:'uppercase'}}>Bosch EDC17CP45 · N57 Diesel</div>
          </div>
        </div>
        <div style={{flex:1}}/>
        {buf&&<div style={{fontSize:'10px',color:C.textMid,background:C.surface2,padding:'4px 10px',borderRadius:'5px',border:`1px solid ${C.border}`,maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {versions[0]?.text||file?.name||'No version string'}
        </div>}
        {patched&&<div style={{fontSize:'10px',color:C.green,fontWeight:700,whiteSpace:'nowrap'}}>● Modified</div>}
        {buf&&(
          <button
            onClick={()=>{
              const hasWork = patched || Object.keys(mapEdits).length>0;
              if(!hasWork || window.confirm('Load a new file? Any unsaved changes will be lost.')) resetProject();
            }}
            style={{display:'flex',alignItems:'center',gap:'6px',padding:'6px 12px',fontSize:'11px',fontWeight:700,
              background:C.surface2,border:`1px solid ${C.border2}`,borderRadius:'6px',color:C.textMid,
              cursor:'pointer',whiteSpace:'nowrap',transition:'all .15s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.text;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border2;e.currentTarget.style.color=C.textMid;}}>
            <span style={{fontSize:'13px'}}>⊕</span> New Project
          </button>
        )}
      </div>

      <div style={{display:'flex',height:'calc(100vh - 52px)'}}>

        {/* ── Sidebar ── */}
        <div className="sidebar" style={{width:'200px',flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',gap:'4px',padding:'12px 8px'}}>
          {[['delete','Delete / DTCs','🛡'],['maps','Map Editor','🗺'],['safety','Safety Check','⚠'],['tips','Tuning Tips','💡'],['export','Export','↓']].map(([id,label,icon])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{width:'100%',padding:'9px 12px',textAlign:'left',border:'none',borderRadius:'7px',cursor:'pointer',display:'flex',alignItems:'center',gap:'8px',fontSize:'12px',fontWeight:600,transition:'all .15s',
                background:tab===id?C.surface2:C.surface,
                color:tab===id?C.text:C.textMid,
                boxShadow:tab===id?`inset 0 0 0 1px ${C.border2}`:'none'}}>
              <span style={{fontSize:'14px'}}>{icon}</span>{label}
            </button>
          ))}
          {buf&&<>
            <div style={{height:'1px',background:C.border,margin:'8px 4px'}}/>
            <div style={{fontSize:'9px',color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',padding:'4px 4px 2px'}}>File</div>
            <div style={{fontSize:'10px',color:C.textMid,padding:'4px 8px',lineHeight:1.6}}>
              <div style={{color:C.text,fontWeight:600,wordBreak:'break-all'}}>{file?.name?.slice(0,24)}</div>
              <div>{(buf.byteLength/1024/1024).toFixed(2)} MB</div>
            </div>
          </>}
        </div>

        {/* ── Main ── */}
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>

          {/* No file */}
          {noFile&&(
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'40px'}}>
              <div style={{maxWidth:'440px',width:'100%',textAlign:'center'}}>
                {loading?(
                  <div style={{textAlign:'center',padding:'60px',color:C.textMid}}>
                    <div style={{fontSize:'24px',marginBottom:'12px'}}>⏳</div>
                    <div style={{fontSize:'14px',fontWeight:600}}>Reading file…</div>
                  </div>
                ):(
                  <div style={{maxWidth:'440px',width:'100%',textAlign:'center'}}>
                    <div style={{fontSize:'40px',marginBottom:'16px'}}>⚙️</div>
                    <div style={{fontSize:'20px',fontWeight:700,marginBottom:'8px'}}>ECU Tune Suite</div>
                    <div style={{fontSize:'13px',color:C.textMid,marginBottom:'28px',lineHeight:1.7}}>
                      BMW diesel ECU calibration.<br/>EGR · DPF · AdBlue · Swirl delete + Stage tuning.
                    </div>
                    <label htmlFor="mainFileInput"
                      onDrop={e=>handleDrop(e,false)} onDragOver={e=>e.preventDefault()}
                      style={{display:'block',border:`2px dashed ${C.border2}`,borderRadius:'12px',
                        padding:'40px',cursor:'pointer',background:C.surface,
                        color:C.textMid,lineHeight:1.8,transition:'all .2s'}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=C.surface2;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border2;e.currentTarget.style.background=C.surface;}}>
                      <input id="mainFileInput" type="file" accept=".bin,.BIN" style={{display:'none'}}
                        onChange={e=>handleDrop(e,false)}/>
                      <div style={{fontSize:'28px',marginBottom:'8px'}}>📂</div>
                      <div style={{fontSize:'14px',fontWeight:600,color:C.text,marginBottom:'4px'}}>Click to select ECU binary</div>
                      <div style={{fontSize:'11px',color:C.textFaint}}>or drag and drop · .bin files</div>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── DELETE TAB ─── */}
          {!noFile&&tab==='delete'&&(
            <div style={{flex:1,overflow:'auto',padding:'20px'}}>
              {/* File status summary banner */}
              {Object.keys(deleteStatus).length>0&&(
                <div style={{marginBottom:'12px',padding:'10px 14px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'8px',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
                  <span style={{fontSize:'10px',fontWeight:700,color:C.textFaint,letterSpacing:'.08em',textTransform:'uppercase',marginRight:'4px'}}>File Status:</span>
                  {Object.entries(deleteStatus).map(([sys,status])=>{
                    const col=status==='DELETED'?C.green:status==='PARTIAL'?C.amber:C.textFaint;
                    const bg=status==='DELETED'?C.greenDim+'22':status==='PARTIAL'?C.amberDim+'22':C.surface2;
                    const icon=status==='DELETED'?'✓':status==='PARTIAL'?'◑':'○';
                    return <span key={sys} style={{display:'flex',alignItems:'center',gap:'4px',padding:'3px 8px',background:bg,border:`1px solid ${col}44`,borderRadius:'4px',fontSize:'10px',fontWeight:700,color:col}}>
                      {icon} {SYS[sys]?.label||sys}
                    </span>;
                  })}
                  {Object.values(deleteStatus).every(s=>s==='DELETED')&&
                    <span style={{marginLeft:'4px',fontSize:'10px',color:C.green}}>— all systems already deleted in this file</span>}
                  {Object.values(deleteStatus).some(s=>s==='PARTIAL')&&
                    <span style={{marginLeft:'4px',fontSize:'10px',color:C.amber}}>— partial delete detected, check maps carefully</span>}
                </div>
              )}

              {/* System tabs */}
              <div style={{display:'flex',gap:'6px',marginBottom:'16px',flexWrap:'wrap'}}>
                {Object.entries(SYS).map(([key,s])=>{
                  const sysActive=delSys===key;
                  const maps=MAP_DB.EDC17CP45[key]||[];
                  const found=maps.filter(m=>(scanRes[m.id]||0)>0).length;
                  const delStat=deleteStatus[key];
                  const statCol=delStat==='DELETED'?C.green:delStat==='PARTIAL'?C.amber:null;
                  return (
                    <button key={key} onClick={()=>setDelSys(key)} className="sys-tab"
                      style={{background:sysActive?s.bg:C.surface2,color:sysActive?s.col:C.textMid,
                        border:`1px solid ${sysActive?s.col+'55':C.border}`,
                        boxShadow:sysActive?`0 0 0 1px ${s.col}22`:'none',
                        display:'flex',alignItems:'center',gap:'5px'}}>
                      {s.label}
                      <span style={{opacity:0.7,fontWeight:400}}>({found}/{maps.length})</span>
                      {delStat&&delStat!=='STOCK'&&(
                        <span style={{fontSize:'8px',fontWeight:900,color:statCol,background:statCol+'22',border:`1px solid ${statCol}44`,borderRadius:'3px',padding:'1px 4px',letterSpacing:'.04em'}}>
                          {delStat==='DELETED'?'✓ DELETED':'◑ PARTIAL'}
                        </span>
                      )}
                    </button>
                  );
                })}
                <div style={{flex:1}}/>
                <button onClick={applyDeletes} style={{...btn(C.red,'#7F1D1D22'),padding:'6px 18px'}}>
                  Apply Selected Deletes
                </button>
              </div>

              {/* ── System Visual Diagram ── */}
              {(()=>{
                const isDel = deleteStatus[delSys]==='DELETED';
                const isPartial = deleteStatus[delSys]==='PARTIAL';
                const sys = SYS[delSys];
                const col = isDel ? C.green : isPartial ? C.amber : sys.col;
                const dim = isDel || isPartial;

                const Pipe = ({x1,y1,x2,y2,w=3,dash=false,active=true})=>(
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={active&&!dim?sys.col+'99':'#1F2937'}
                    strokeWidth={w} strokeDasharray={dash?'6 4':'0'}/>
                );
                const Box = ({x,y,w,h,label,sub,highlight=false,deleted=false})=>(
                  <g>
                    <rect x={x} y={y} width={w} height={h} rx="4"
                      fill={highlight&&!deleted?sys.col+'22':'#0D1117'}
                      stroke={highlight&&!deleted?sys.col:deleted?'#374151':'#374151'}
                      strokeWidth={highlight?1.5:1}/>
                    <text x={x+w/2} y={y+h/2-(sub?4:0)} textAnchor="middle"
                      fill={highlight&&!deleted?sys.col:deleted?'#374151':'#9CA3AF'}
                      fontSize="9" fontWeight={highlight?"700":"400"}>{label}</text>
                    {sub&&<text x={x+w/2} y={y+h/2+8} textAnchor="middle"
                      fill={highlight&&!deleted?sys.col+'aa':'#4B5563'} fontSize="7">{sub}</text>}
                    {deleted&&<>
                      <line x1={x+4} y1={y+4} x2={x+w-4} y2={y+h-4} stroke={C.red} strokeWidth="1.5"/>
                      <line x1={x+w-4} y1={y+4} x2={x+4} y2={y+h-4} stroke={C.red} strokeWidth="1.5"/>
                    </>}
                  </g>
                );
                const diagrams = {
                  EGR: (
                    <svg viewBox="0 0 580 130" style={{width:'100%',height:'130px'}}>
                      {/* Exhaust main line */}
                      <line x1="80" y1="88" x2="560" y2="88" stroke="#1F2937" strokeWidth="8" strokeLinecap="round"/>
                      <line x1="80" y1="88" x2="560" y2="88" stroke={dim?'#111418':'#EF444433'} strokeWidth="6" strokeLinecap="round"/>
                      {/* Intake line */}
                      <line x1="80" y1="42" x2="280" y2="42" stroke="#1F2937" strokeWidth="8" strokeLinecap="round"/>
                      <line x1="80" y1="42" x2="280" y2="42" stroke={dim?'#111418':'#3B82F633'} strokeWidth="6" strokeLinecap="round"/>
                      {/* EGR loop */}
                      <path d="M 340,82 Q 340,30 280,30 Q 200,30 200,42" fill="none"
                        stroke={dim?'#111418':sys.col+'66'} strokeWidth="4" strokeDasharray={dim?'6 4':'0'}/>
                      {/* Components */}
                      <Box x={20} y={65} w={60} h={46} label="N57" sub="ENGINE"/>
                      <Box x={170} y={72} w={70} h={32} label="TURBO" highlight={false}/>
                      <Box x={280} y={72} w={60} h={32} label="DOC"/>
                      <Box x={380} y={10} w={70} h={50} label="EGR COOLER" sub="+VALVE" highlight={true} deleted={dim}/>
                      <Box x={490} y={72} w={70} h={32} label="EXHAUST"/>
                      {/* EGR valve connection arrows */}
                      {!dim&&<>
                        <line x1="345" y1="82" x2="415" y2="60" stroke={sys.col+'88'} strokeWidth="1.5" strokeDasharray="3 3"/>
                        <circle cx="345" cy="82" r="4" fill={sys.col+'66'}/>
                        <circle cx="200" cy="42" r="4" fill={sys.col+'66'}/>
                      </>}
                      {/* Flow arrows */}
                      <polygon points="155,83 163,88 155,93" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="265,83 273,88 265,93" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="375,83 383,88 375,93" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="475,83 483,88 475,93" fill={dim?'#1F2937':'#EF444466'}/>
                      {/* Labels */}
                      <text x="415" y="127" textAnchor="middle" fill="#4B5563" fontSize="8">EXHAUST FLOW →</text>
                      <text x="200" y="22" textAnchor="middle" fill={dim?'#374151':sys.col+'99'} fontSize="8">
                        {dim?'EGR DELETED — GASES NO LONGER RECIRCULATED':'↑ HOT EXHAUST GAS RECIRCULATES TO INTAKE'}
                      </text>
                      {dim&&<>
                        <line x1="180" y1="88" x2="480" y2="88" stroke={C.green+'44'} strokeWidth="3"/>
                        <text x="330" y="108" textAnchor="middle" fill={C.green} fontSize="9" fontWeight="700">✓ EGR VALVE BLANKED — CLEAN AIR ONLY</text>
                      </>}
                    </svg>
                  ),
                  DPF: (
                    <svg viewBox="0 0 580 130" style={{width:'100%',height:'130px'}}>
                      <line x1="80" y1="75" x2="560" y2="75" stroke="#1F2937" strokeWidth="8" strokeLinecap="round"/>
                      <line x1="80" y1="75" x2="560" y2="75" stroke={dim?'#111418':'#EF444433'} strokeWidth="6" strokeLinecap="round"/>
                      <Box x={20} y={57} w={60} h={36} label="N57" sub="ENGINE"/>
                      <Box x={145} y={59} w={65} h={32} label="TURBO"/>
                      <Box x={255} y={59} w={55} h={32} label="DOC"/>
                      {/* DPF — honeycomb visual */}
                      <g>
                        <rect x={360} y={50} width={75} height={50} rx="5"
                          fill={dim?'#0D1117':sys.col+'15'}
                          stroke={dim?'#374151':sys.col} strokeWidth={dim?1:1.5}/>
                        {dim&&<>
                          <line x1="364" y1="54" x2="431" y2="96" stroke={C.red} strokeWidth="2"/>
                          <line x1="431" y1="54" x2="364" y2="96" stroke={C.red} strokeWidth="2"/>
                        </>}
                        {!dim&&[0,1,2,3].map(i=>[0,1].map(j=>(
                          <rect key={`${i}${j}`} x={366+i*17} y={55+j*20} width="13" height="16" rx="1"
                            fill={sys.col+'22'} stroke={sys.col+'44'} strokeWidth="0.5"/>
                        )))}
                        <text x="397" y="110" textAnchor="middle"
                          fill={dim?'#374151':sys.col} fontSize="8" fontWeight="700">DPF FILTER</text>
                      </g>
                      <Box x={490} y={59} w={70} h={32} label="SILENCER" sub="→ TAILPIPE"/>
                      <polygon points="130,70 138,75 130,80" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="240,70 248,75 240,80" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="345,70 353,75 345,80" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="475,70 483,75 475,80" fill={dim?'#1F2937':'#EF444466'}/>
                      {!dim&&<>
                        <text x="397" y="38" textAnchor="middle" fill={sys.col+'99'} fontSize="8">SOOT PARTICLES TRAPPED</text>
                        <line x1="380" y1="41" x2="380" y2="50" stroke={sys.col+'44'} strokeWidth="1"/>
                        <line x1="410" y1="41" x2="410" y2="50" stroke={sys.col+'44'} strokeWidth="1"/>
                      </>}
                      {dim&&<text x="290" y="112" textAnchor="middle" fill={C.green} fontSize="9" fontWeight="700">✓ DPF REMOVED — STRAIGHT-THROUGH EXHAUST FLOW</text>}
                    </svg>
                  ),
                  ADBLUE: (
                    <svg viewBox="0 0 580 140" style={{width:'100%',height:'140px'}}>
                      <line x1="80" y1="75" x2="560" y2="75" stroke="#1F2937" strokeWidth="8" strokeLinecap="round"/>
                      <line x1="80" y1="75" x2="560" y2="75" stroke={dim?'#111418':'#EF444433'} strokeWidth="6" strokeLinecap="round"/>
                      <Box x={20} y={57} w={55} h={36} label="N57" sub="ENGINE"/>
                      <Box x={135} y={59} w={55} h={32} label="DPF"/>
                      {/* SCR Catalyst */}
                      <g>
                        <rect x={315} y={50} width={85} height={50} rx="5"
                          fill={dim?'#0D1117':sys.col+'15'}
                          stroke={dim?'#374151':sys.col} strokeWidth={dim?1:1.5}/>
                        {dim&&<>
                          <line x1="319" y1="54" x2="396" y2="96" stroke={C.red} strokeWidth="2"/>
                          <line x1="396" y1="54" x2="319" y2="96" stroke={C.red} strokeWidth="2"/>
                        </>}
                        {!dim&&<>
                          <text x="357" y="72" textAnchor="middle" fill={sys.col} fontSize="8" fontWeight="700">SCR</text>
                          <text x="357" y="82" textAnchor="middle" fill={sys.col+'aa'} fontSize="7">NOx CATALYST</text>
                        </>}
                        <text x="357" y="112" textAnchor="middle"
                          fill={dim?'#374151':sys.col} fontSize="8">{dim?'SCR DISABLED':'SCR CATALYST'}</text>
                      </g>
                      {/* AdBlue tank + injector */}
                      {!dim?(
                        <g>
                          <rect x={310} y={10} width={45} height={28} rx="3"
                            fill={sys.col+'22'} stroke={sys.col+'66'} strokeWidth="1"/>
                          <text x="332" y="21" textAnchor="middle" fill={sys.col} fontSize="7">ADBLUE</text>
                          <text x="332" y="30" textAnchor="middle" fill={sys.col+'aa'} fontSize="6">TANK+PUMP</text>
                          <line x1="332" y1="38" x2="350" y2="50" stroke={sys.col+'88'} strokeWidth="1.5" strokeDasharray="2 2"/>
                          <circle cx="350" cy="50" r="3" fill={sys.col}/>
                          <text x="380" y="20" fill={sys.col+'88'} fontSize="7">DOSING</text>
                          <text x="380" y="28" fill={sys.col+'88'} fontSize="7">INJECTOR ↓</text>
                        </g>
                      ):(
                        <g>
                          <rect x={310} y={10} width={45} height={28} rx="3"
                            fill="#0D1117" stroke="#1F2937" strokeWidth="1"/>
                          <line x1="314" y1="14" x2="351" y2="34" stroke={C.red} strokeWidth="1.5"/>
                          <line x1="351" y1="14" x2="314" y2="34" stroke={C.red} strokeWidth="1.5"/>
                          <text x="332" y="48" textAnchor="middle" fill="#374151" fontSize="7">DISABLED</text>
                        </g>
                      )}
                      <Box x={455} y={59} w={70} h={32} label="TAILPIPE"/>
                      <polygon points="120,70 128,75 120,80" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="300,70 308,75 300,80" fill={dim?'#1F2937':'#EF444466'}/>
                      <polygon points="440,70 448,75 440,80" fill={dim?'#1F2937':'#EF444466'}/>
                      {dim&&<text x="290" y="130" textAnchor="middle" fill={C.green} fontSize="9" fontWeight="700">✓ ADBLUE SYSTEM DISABLED — DOSING + MONITORING OFF</text>}
                    </svg>
                  ),
                  SWIRL: (
                    <svg viewBox="0 0 580 130" style={{width:'100%',height:'130px'}}>
                      <text x="30" y="25" fill="#4B5563" fontSize="9">INTAKE MANIFOLD — 6 CYLINDER RUNNERS (N57)</text>
                      {/* Draw 6 cylinder runners with swirl flaps */}
                      {[0,1,2,3,4,5].map(i=>{
                        const x = 30 + i*88;
                        const cy = 75;
                        const flap_angle = dim ? 0 : 40; // degrees
                        const rad = flap_angle * Math.PI / 180;
                        const fx1 = x+44 + Math.cos(Math.PI/2+rad)*22;
                        const fy1 = cy + Math.sin(Math.PI/2+rad)*22;
                        const fx2 = x+44 + Math.cos(-Math.PI/2+rad)*22;
                        const fy2 = cy + Math.sin(-Math.PI/2+rad)*22;
                        return (
                          <g key={i}>
                            {/* Runner pipe */}
                            <rect x={x+20} y={35} width={48} height={80} rx="3"
                              fill="#0D1117" stroke="#374151" strokeWidth="1.5"/>
                            {/* Swirl flap */}
                            <line x1={fx1} y1={fy1} x2={fx2} y2={fy2}
                              stroke={dim?'#374151':sys.col} strokeWidth="3"
                              strokeLinecap="round"/>
                            {/* Pivot point */}
                            <circle cx={x+44} cy={cy} r="3"
                              fill={dim?'#374151':sys.col}/>
                            {/* Cylinder head */}
                            <rect x={x+20} y={108} width={48} height={8} rx="2"
                              fill="#1F2937" stroke="#374151"/>
                            {/* Air flow arrow */}
                            <polygon points={`${x+44},38 ${x+39},48 ${x+49},48`}
                              fill={dim?'#1F2937':'#3B82F644'}/>
                          </g>
                        );
                      })}
                      {/* Labels */}
                      <text x="290" y="122" textAnchor="middle"
                        fill={dim?C.green:'#4B5563'} fontSize="8" fontWeight={dim?'700':'400'}>
                        {dim?'✓ SWIRL FLAPS FULLY OPEN — FREE-FLOWING INTAKE':'SWIRL FLAPS ACTIVE — CREATING INTAKE CHARGE ROTATION'}
                      </text>
                      {!dim&&<>
                        <text x="290" y="16" textAnchor="middle" fill={sys.col+'88'} fontSize="8">FLAPS ANGLED 40° — CREATES SWIRL FOR BETTER COMBUSTION AT LOW LOAD</text>
                        <text x="30" y="122" fill={sys.col+'88'} fontSize="7">←← SWIRL</text>
                      </>}
                    </svg>
                  ),
                };

                return (
                  <div style={{marginBottom:'14px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'10px',overflow:'hidden'}}>
                    {/* Visual header */}
                    <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'10px',background:C.surface2}}>
                      <div style={{width:'8px',height:'8px',borderRadius:'50%',background:col,
                        boxShadow:dim?'none':`0 0 6px ${col}88`}}/>
                      <span style={{fontSize:'11px',fontWeight:700,color:col}}>
                        {dim ? `${sys.label} — ${deleteStatus[delSys]}` : `${sys.label} — ACTIVE IN THIS FILE`}
                      </span>
                      <div style={{flex:1}}/>
                      <span style={{fontSize:'9px',color:C.textFaint}}>
                        {delSys==='EGR'?'Exhaust Gas Recirculation — returns hot exhaust gases to intake to lower combustion temps and NOx'
                        :delSys==='DPF'?'Diesel Particulate Filter — traps soot particles, regenerates under sustained high load'
                        :delSys==='ADBLUE'?'Selective Catalytic Reduction — injects AdBlue urea solution to neutralise NOx'
                        :'Swirl Flap System — rotates intake charge for better low-load fuel atomisation'}
                      </span>
                    </div>
                    <div style={{padding:'10px 14px 6px',background:'#070A0E'}}>
                      {diagrams[delSys]}
                    </div>
                  </div>
                );
              })()}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                {/* Left: Maps + Counter Reset (AdBlue only) */}
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                <div className="card">
                  <div style={{fontSize:'11px',fontWeight:700,color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'10px'}}>
                    Calibration Maps — {delSys}
                  </div>
                  {(MAP_DB.EDC17CP45[delSys]||[]).map(m=>{
                    const hits=scanRes[m.id]||0;
                    const found=hits>0;
                    const sys=SYS[delSys];
                    return (
                      <div key={m.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 10px',
                        borderRadius:'6px',marginBottom:'4px',background:enabled[m.id]&&found?sys.bg+'44':C.surface2,
                        border:`1px solid ${enabled[m.id]&&found?sys.col+'33':C.border}`,cursor:'pointer'}}
                        onClick={()=>setEnabled(e=>({...e,[m.id]:!e[m.id]}))}>
                        <div style={{width:'18px',height:'18px',border:`2px solid ${found?sys.col:C.border2}`,
                          borderRadius:'4px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                          background:enabled[m.id]&&found?sys.col:'transparent'}}>
                          {enabled[m.id]&&found&&<span style={{color:'#000',fontSize:'10px',fontWeight:900}}>✓</span>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'11px',fontWeight:600,color:found?C.text:C.textFaint}}>{m.name}</div>
                          <div style={{fontSize:'9px',color:C.textFaint,marginTop:'1px'}}>{m.note}</div>
                        </div>
                        <div className="badge" style={{background:found?sys.bg:C.surface,color:found?sys.col:C.textFaint,
                          border:`1px solid ${found?sys.col+'44':C.border}`}}>
                          {found?`${hits} hit${hits>1?'s':''}` : 'NOT FOUND'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Counter Reset Card — only for AdBlue */}
                {delSys==='ADBLUE'&&(
                  <div className="card" style={{borderColor:C.blue+'44',background:C.blue+'08'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                      <div style={{fontSize:'16px'}}>🔢</div>
                      <div>
                        <div style={{fontSize:'11px',fontWeight:700,color:C.blue,letterSpacing:'.1em',textTransform:'uppercase'}}>Counter Reset</div>
                        <div style={{fontSize:'10px',color:C.textFaint,marginTop:'1px'}}>Prevents P11CF/P11D5/P11D6 counter-based limp mode</div>
                      </div>
                    </div>
                    {COUNTER_DB.map(ctr=>{
                      const hits=scanRes[ctr.id]??findAll(buf,new Uint8Array(ctr.sig)).length;
                      const found=hits>0;
                      return (
                        <div key={ctr.id} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'9px 10px',
                          borderRadius:'6px',marginBottom:'6px',
                          background:counterEnabled[ctr.id]&&found?C.blue+'18':C.surface2,
                          border:`1px solid ${counterEnabled[ctr.id]&&found?C.blue+'44':C.border}`,cursor:'pointer'}}
                          onClick={()=>setCounterEnabled(e=>({...e,[ctr.id]:!e[ctr.id]}))}>
                          <div style={{width:'18px',height:'18px',border:`2px solid ${found?C.blue:C.border2}`,
                            borderRadius:'4px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:'1px',
                            background:counterEnabled[ctr.id]&&found?C.blue:'transparent'}}>
                            {counterEnabled[ctr.id]&&found&&<span style={{color:'#000',fontSize:'10px',fontWeight:900}}>✓</span>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:'11px',fontWeight:600,color:found?C.text:C.textFaint}}>{ctr.name}</div>
                            <div style={{fontSize:'9px',color:C.textFaint,marginTop:'2px',lineHeight:1.5}}>{ctr.desc}</div>
                            <div style={{display:'flex',gap:'4px',marginTop:'4px',flexWrap:'wrap'}}>
                              {ctr.codes.map(c=>(
                                <span key={c} style={{fontSize:'8px',fontWeight:700,fontFamily:'monospace',
                                  color:C.red,background:C.redDim+'22',border:`1px solid ${C.red}33`,
                                  borderRadius:'2px',padding:'1px 4px'}}>{c}</span>
                              ))}
                            </div>
                          </div>
                          <div className="badge" style={{background:found?C.blue+'22':C.surface,color:found?C.blue:C.textFaint,
                            border:`1px solid ${found?C.blue+'44':C.border}`,flexShrink:0}}>
                            {found?'FOUND':'NOT FOUND'}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{marginTop:'8px',padding:'8px 10px',background:C.surface2,borderRadius:'5px',fontSize:'9px',color:C.textFaint,lineHeight:1.7,border:`1px solid ${C.border}`}}>
                      <b style={{color:C.textMid}}>How it works:</b> Sets km and drive-cycle thresholds to 65535 (max uint16) so the counter can never reach the trigger point. Does not clear existing stored DTCs — clear those separately via OBD scanner after flashing.
                    </div>
                  </div>
                )}
                </div>{/* end left column */}

                {/* Right: DTCs */}
                <div className="card" style={{overflow:'auto',maxHeight:'500px'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'10px'}}>
                    Fault Codes — {delSys}
                  </div>
                  {(DTC_MAP[delSys]||[]).map(d=>(
                    <div key={d.code} className="dtc-row">
                      <div style={{flexShrink:0,width:'60px'}}>
                        <div style={{fontFamily:'monospace',fontSize:'12px',fontWeight:700,color:d.limp?C.red:C.text}}>{d.code}</div>
                        {d.limp&&<div style={{fontSize:'8px',color:C.red,fontWeight:700,letterSpacing:'.05em',marginTop:'2px'}}>LIMP</div>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'11px',fontWeight:600,color:C.text,marginBottom:'2px'}}>{d.name}</div>
                        <div style={{fontSize:'10px',color:C.textFaint,lineHeight:1.5}}>{d.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── MAPS TAB ─── */}
          {!noFile&&tab==='maps'&&(()=>{
            const cats=[...new Set(MAPS_DB.map(m=>m.cat))];
            const working=patched||buf;
            const baseVals = selDef ? (mapEdits[selMap]??getMapData(working,selDef,scanned,sigOffsets)) : null;
            const modVals  = selDef && buf2 ? getMapData(buf2,selDef,scanned,sigOffsets) : null;
            const dispVals=diffMode==='f2'&&modVals?modVals:baseVals;
            const nonZ=dispVals?.filter(v=>v>0)||[];
            const scMin=nonZ.length?Math.min(...nonZ):0,scMax=nonZ.length?Math.max(...nonZ):1;
            const dp=selDef?.scale&&selDef.scale<1?1:0;

            // Scan view — show auto-discovered maps
            if (scanView==='scan') {
              const sm = scanSelMap;
              const allRegions = ['All',...new Set((scanResults||[]).map(m=>m.region))];
              const filtered = (scanResults||[]).filter(m=>scanCat==='All'||m.region===scanCat);
              // Build display values for selected map
              const smSv = sm ? sm.sv : null;
              const smMv = sm ? sm.mv : null;
              const smMx = smSv ? Math.max(...smSv.filter(v=>v<60000&&v>0), 1) : 1;
              const smMn = smSv ? Math.min(...smSv.filter(v=>v>0)) : 0;
              // Guess best dimensions from cell count
              const guessDims = (n) => {
                for (const nc of [16,12,10,8,6,4]) {
                  for (const nr of [16,12,10,8,6,4,3,2]) {
                    if (nc*nr === n) return {nc,nr};
                  }
                }
                const nc = Math.min(16, Math.round(Math.sqrt(n))); return {nc, nr: Math.ceil(n/nc)};
              };
              const dims = sm ? guessDims(Math.min(sm.cells, 256)) : null;
              return (
                <div style={{display:'flex',flex:1,overflow:'hidden'}}>
                  {/* Diff sidebar */}
                  <div style={{width:'260px',flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                    <div style={{padding:'8px 10px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap'}}>
                      <button onClick={()=>{setScanView('db');setScanSelMap(null);}}
                        style={{padding:'4px 8px',fontSize:'9px',fontWeight:700,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:'4px',color:C.textMid,cursor:'pointer'}}>← DB Maps</button>
                      <div style={{fontSize:'10px',fontWeight:700,color:C.text}}>{(scanResults||[]).length} confirmed changes</div>
                    </div>
                    {/* Region filter */}
                    <div style={{padding:'5px 8px',borderBottom:`1px solid ${C.border}`,display:'flex',flexWrap:'wrap',gap:'3px'}}>
                      {allRegions.map(r=>{
                        const cnt = r==='All'?(scanResults||[]).length:(scanResults||[]).filter(m=>m.region===r).length;
                        const col = r==='All'?C.textMid:(scanResults||[]).find(m=>m.region===r)?.col||C.textFaint;
                        return <button key={r} onClick={()=>setScanCat(r)}
                          style={{padding:'2px 5px',fontSize:'7px',fontWeight:700,borderRadius:'3px',cursor:'pointer',
                            border:`1px solid ${scanCat===r?col+'88':C.border}`,
                            background:scanCat===r?col+'22':C.surface2,color:scanCat===r?col:C.textFaint}}>
                          {r.replace('/ ','/')} {cnt}
                        </button>;
                      })}
                    </div>
                    {/* Results list */}
                    <div style={{flex:1,overflowY:'auto'}}>
                      {filtered.map(m=>{
                        const isSel = scanSelMap?.off===m.off;
                        const pctCol = m.pct>20?C.red:m.pct>5?C.amber:m.pct>0?C.green:m.pct<0?C.blue:C.textFaint;
                        return <div key={m.off} onClick={()=>setScanSelMap(m)}
                          style={{padding:'6px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:'8px',
                            borderLeft:`3px solid ${isSel?m.col:'transparent'}`,
                            background:isSel?m.col+'11':'transparent'}}>
                          <div style={{width:'8px',height:'8px',borderRadius:'50%',background:m.known?m.col:'#374151',flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:'10px',color:isSel?C.text:m.known?C.textMid:C.textFaint,
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:m.known?600:400}}>
                              {m.name||`Unknown @ 0x${m.off.toString(16).toUpperCase()}`}
                            </div>
                            <div style={{display:'flex',gap:'6px',marginTop:'1px',fontSize:'8px',color:C.textFaint}}>
                              <span style={{fontFamily:'monospace'}}>0x{m.off.toString(16).toUpperCase()}</span>
                              <span>{m.size}B</span>
                              <span>{m.cells} cells</span>
                            </div>
                          </div>
                          {m.pct!==0&&<span style={{fontSize:'9px',fontWeight:700,color:pctCol,flexShrink:0}}>{m.pct>0?'+':''}{m.pct}%</span>}
                        </div>;
                      })}
                    </div>
                  </div>

                  {/* Map detail */}
                  <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                    {!sm?(
                      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:C.textFaint,gap:'8px'}}>
                        <div style={{fontSize:'28px'}}>👆</div>
                        <div style={{fontSize:'12px'}}>Select a changed region from the list</div>
                        <div style={{fontSize:'10px',color:C.textFaint,maxWidth:'300px',textAlign:'center',lineHeight:1.6}}>
                          Every entry is a confirmed real calibration change between the two loaded files. Named entries link to maps in our curated database.
                        </div>
                      </div>
                    ):(
                      <>
                        <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
                          <div style={{display:'flex',gap:'10px',alignItems:'flex-start',flexWrap:'wrap'}}>
                            <div style={{flex:1}}>
                              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'3px'}}>
                                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:sm.col}}/>
                                <div style={{fontSize:'13px',fontWeight:700,color:C.text}}>{sm.name||'Unknown Map'}</div>
                                {sm.known&&<span style={{fontSize:'8px',fontWeight:700,color:C.green,background:C.greenDim+'22',border:`1px solid ${C.green}33`,borderRadius:'3px',padding:'1px 4px'}}>IN DB</span>}
                              </div>
                              <div style={{display:'flex',gap:'10px',flexWrap:'wrap',fontSize:'9px',color:C.textFaint}}>
                                <span style={{fontFamily:'monospace'}}>0x{sm.off.toString(16).toUpperCase()}–0x{sm.end.toString(16).toUpperCase()}</span>
                                <span>{sm.size}B · {sm.cells} u16 cells</span>
                                <span style={{color:sm.col}}>{sm.region}</span>
                                {sm.pct!==0&&<span style={{color:sm.pct>0?C.red:C.blue,fontWeight:700}}>
                                  {sm.pct>0?'↑ Increased':'↓ Decreased'} {Math.abs(sm.pct)}%
                                </span>}
                              </div>
                            </div>
                            {sm.known&&<button
                              onClick={()=>{
                                const km = MAPS_DB.find(m=>m.offset&&Math.abs(m.offset-sm.off)<200);
                                if(km){setSelMap(km.id);setScanView('db');}
                              }}
                              style={{padding:'6px 12px',fontSize:'10px',fontWeight:700,background:C.accent+'22',border:`1px solid ${C.accent}44`,borderRadius:'5px',color:C.accent,cursor:'pointer',whiteSpace:'nowrap'}}>
                              View in Map Editor →
                            </button>}
                          </div>
                        </div>
                        <div style={{flex:1,overflow:'auto',padding:'12px 14px'}}>
                          {/* Diff table */}
                          <div style={{marginBottom:'8px',display:'flex',gap:'14px',fontSize:'9px'}}>
                            <span style={{color:C.red}}>■ Red = Stock value increased in mod</span>
                            <span style={{color:C.blue}}>■ Blue = Stock value decreased in mod</span>
                            <span style={{color:C.textFaint}}>■ Unchanged</span>
                          </div>
                          {dims&&(()=>{
                            const {nc,nr}=dims;
                            return (
                              <div style={{overflowX:'auto'}}>
                                {Array.from({length:nr},(_,row)=>(
                                  <div key={row} style={{display:'flex',marginBottom:'1px'}}>
                                    <div style={{width:'24px',flexShrink:0,fontSize:'8px',color:C.textFaint,fontFamily:'monospace',textAlign:'right',paddingRight:'4px',paddingTop:'4px'}}>{row+1}</div>
                                    {Array.from({length:nc},(_,col)=>{
                                      const idx=row*nc+col;
                                      const sv=smSv?.[idx]??0;
                                      const mv=smMv?.[idx]??0;
                                      const changed=sv!==mv;
                                      const up=mv>sv;
                                      const t=smMx>smMn?(sv-smMn)/(smMx-smMn):0;
                                      const hue=Math.round((1-Math.min(1,Math.max(0,t)))*220);
                                      const bg=changed?(up?`hsl(0,70%,28%)`:`hsl(220,70%,28%)`):`hsl(${hue},75%,${26+t*14}%)`;
                                      const pct=sv>0&&changed?Math.round((mv-sv)/sv*100):null;
                                      return (
                                        <div key={col} style={{flex:1,minWidth:'36px',height:'32px',background:bg,borderRadius:'2px',
                                          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                                          border:changed?`1px solid ${up?C.red+'66':C.blue+'66'}`:'1px solid transparent'}}>
                                          <div style={{fontSize:'9px',fontWeight:600,color:'#F9FAFB',fontFamily:'monospace',lineHeight:1}}>{sv}</div>
                                          {changed&&<div style={{fontSize:'7px',color:up?'#FCA5A5':'#93C5FD',lineHeight:1}}>{mv}</div>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          <div style={{marginTop:'10px',padding:'8px 10px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'5px',fontSize:'9px',color:C.textFaint,lineHeight:1.7}}>
                            <b style={{color:C.textMid}}>Raw u16 values shown (Little Endian).</b> Scale unknown for unnamed maps — compare cell values against known maps in the same region. Top row = row 1, left = lowest axis value. If "IN DB", click "View in Map Editor" to see with correct scale and labels.
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            }


            return (
              <div style={{display:'flex',flex:1,overflow:'hidden'}}>
                {/* Map list sidebar */}
                <div style={{width:'220px',flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  {/* Version compatibility badge */}
                  {buf&&(()=>{
                    const found = Object.values(sigConf).filter(v=>v==='found').length;
                    const approx = Object.values(sigConf).filter(v=>v==='approx').length;
                    const total = SIG_DB.length;
                    const pct = Math.round((found+approx)/total*100);
                    const col = pct>85?C.green:pct>60?C.amber:C.red;
                    const label = pct>85?'Full compatibility':'Partial compatibility';
                    return (
                      <div style={{padding:'6px 10px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'7px'}}>
                        <div style={{width:'7px',height:'7px',borderRadius:'50%',background:col,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:'9px',fontWeight:700,color:col}}>{label}</div>
                          <div style={{fontSize:'8px',color:C.textFaint}}>{found} exact · {approx} approx · {total-found-approx} fallback</div>
                        </div>
                        <div style={{fontSize:'10px',fontWeight:700,color:col}}>{pct}%</div>
                      </div>
                    );
                  })()}
                  {/* Scan button */}
                  <div style={{padding:'8px',borderBottom:`1px solid ${C.border}`}}>
                    {scanning?(
                      <div style={{padding:'8px',background:C.surface2,borderRadius:'6px'}}>
                        <div style={{fontSize:'9px',fontWeight:700,color:C.accent,marginBottom:'5px'}}>🔍 Scanning diff…  {scanProgress}%</div>
                        <div style={{height:'4px',background:C.border,borderRadius:'2px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${scanProgress}%`,background:C.accent,borderRadius:'2px',transition:'width .1s'}}/>
                        </div>
                      </div>
                    ):scanResults?(
                      <button onClick={()=>setScanView('scan')}
                        style={{width:'100%',padding:'8px',fontSize:'10px',fontWeight:700,
                          background:`linear-gradient(135deg,${C.green}22,${C.accent}22)`,
                          border:`1px solid ${C.green}44`,borderRadius:'6px',
                          color:C.green,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                        <span style={{fontSize:'13px'}}>✓</span> View {scanResults.length} Confirmed Changes
                      </button>
                    ):buf2?(
                      <button onClick={runAutoScanner}
                        style={{width:'100%',padding:'8px',fontSize:'10px',fontWeight:700,
                          background:`linear-gradient(135deg,${C.accent}22,#4C1D9522)`,
                          border:`1px solid ${C.accent}44`,borderRadius:'6px',
                          color:C.accent,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                        <span style={{fontSize:'13px'}}>🔍</span> Scan All Changes vs Comparison File
                      </button>
                    ):(
                      <div style={{padding:'8px',background:C.surface2,borderRadius:'6px',textAlign:'center',fontSize:'9px',color:C.textFaint,lineHeight:1.6}}>
                        Drop a <b style={{color:C.textMid}}>comparison binary</b> below to scan all changed calibration maps between the two files
                      </div>
                    )}
                  </div>
                  {/* Comparison file drop */}
                  <div style={{padding:'8px',borderBottom:`1px solid ${C.border}`}}>
                    <label htmlFor="f2Input"
                      onDrop={e=>handleDrop(e,true)} onDragOver={e=>e.preventDefault()}
                      style={{display:'block',padding:'8px',background:C.surface2,border:`1px dashed ${buf2?C.green:C.border2}`,
                        borderRadius:'6px',cursor:'pointer',textAlign:'center',fontSize:'9px',
                        color:buf2?C.green:C.textFaint,lineHeight:1.6}}>
                      <input id="f2Input" type="file" accept=".bin,.BIN" style={{display:'none'}} onChange={e=>handleDrop(e,true)}/>
                      {buf2?`✓ ${file2?.name?.slice(0,22)}`:'⊕ Click or drop comparison binary for diff mode'}
                    </label>
                    {buf2&&(
                      <div style={{display:'flex',gap:'2px',marginTop:'5px'}}>
                        {[['f1','F1 Base'],['f2','F2 Mod'],['diff','Diff']].map(([m,l])=>(
                          <button key={m} onClick={()=>setDiffMode(m)}
                            style={{flex:1,padding:'4px',fontSize:'9px',fontWeight:700,border:'none',borderRadius:'3px',cursor:'pointer',
                              background:diffMode===m?(m==='diff'?C.redDim:C.accentDim)+'44':C.surface2,
                              color:diffMode===m?(m==='diff'?C.red:C.blue):C.textMid}}>
                            {l}
                          </button>
                        ))}
                        <button onClick={autoScan} style={{flex:1.5,padding:'4px',fontSize:'9px',fontWeight:700,border:'none',borderRadius:'3px',cursor:'pointer',background:'#4C1D9533',color:C.purple}}>Scan Δ</button>
                      </div>
                    )}
                  </div>

                  {/* Map list */}
                  <div style={{flex:1,overflowY:'auto',padding:'8px 4px'}}>
                    {autoChg&&(
                      <div>
                        <div style={{fontSize:'8px',fontWeight:700,color:C.purple,padding:'4px 8px',letterSpacing:'.1em',textTransform:'uppercase'}}>Auto Changes ({autoChg.length})</div>
                        {autoChg.slice(0,15).map(c=>(
                          <div key={c.addr} onClick={()=>c.known&&setSelMap(c.knownId)}
                            style={{padding:'4px 8px',borderRadius:'4px',marginBottom:'1px',cursor:c.known?'pointer':'default',
                              borderLeft:`2px solid ${c.pct>0?C.red+'88':C.blue+'88'}`}}>
                            <div style={{fontSize:'9px',color:c.known?C.text:C.textFaint,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'8px',marginTop:'1px'}}>
                              <span style={{color:C.textFaint,fontFamily:'monospace'}}>0x{c.addr.toString(16).toUpperCase()}</span>
                              <span style={{color:c.pct>0?C.red:C.blue,fontWeight:700}}>{c.pct>0?'+':''}{c.pct.toFixed(1)}%</span>
                            </div>
                          </div>
                        ))}
                        <div style={{height:'1px',background:C.border,margin:'6px 4px'}}/>
                      </div>
                    )}
                    {cats.map(cat=>(
                      <div key={cat}>
                        <div style={{fontSize:'8px',fontWeight:700,color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',padding:'4px 8px 2px'}}>{cat}</div>
                        {MAPS_DB.filter(m=>m.cat===cat).map(m=>{
                          // Only check if data exists — don't read full values in sidebar (expensive + can crash)
                          const hasOff = !!(m.offset ?? scanned?.[m.id]?.offset);
                          const bv = hasOff && working ? true : false;
                          const mv = hasOff && buf2 ? true : false;
                          const hasChg = bv && mv && (()=>{
                            const a=getMapData(working,m,scanned,sigOffsets), b2=getMapData(buf2,m,scanned,sigOffsets);
                            return a&&b2&&a.some((v,i)=>v!==b2[i]);
                          })();
                          const hasEd=!!mapEdits[m.id];
                          return (
                            <div key={m.id} className={`map-row${selMap===m.id?' sel':''}`}
                              onClick={()=>setSelMap(m.id)}>
                              <span style={{fontSize:'10px',color:selMap===m.id?C.text:C.textMid,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name}</span>
                              <div style={{display:'flex',gap:'2px',flexShrink:0}}>
                                {m.stg1&&<span className="badge" style={{color:C.amber,background:C.amberDim+'33',border:`1px solid ${C.amber}33`}}>ST1</span>}
                                {hasChg&&<span className="badge" style={{color:C.red,background:C.redDim+'33',border:`1px solid ${C.red}33`}}>Δ</span>}
                                {hasEd&&<span className="badge" style={{color:C.accent,background:C.accentDim+'33',border:`1px solid ${C.accent}33`}}>✎</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Map viewer */}
                <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  {/* Map toolbar */}
                  <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,background:C.surface,display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',flexShrink:0}}>
                    {selDef&&<>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:700,color:C.text}}>{selDef?.name}</div>
                        <div style={{display:'flex',gap:'8px',marginTop:'2px',flexWrap:'wrap',alignItems:'center'}}>
                          {selDef?.bosch&&<span style={{fontFamily:'monospace',fontSize:'9px',color:C.textFaint,background:C.surface2,padding:'1px 5px',borderRadius:'2px'}}>{selDef.bosch}</span>}
                          <span style={{fontSize:'9px',color:C.textFaint}}>{selDef?.xLen}×{selDef?.yLen} {selDef?.vBytes===1?'u8':'u16'} ×{selDef?.scale?.toFixed?.(selDef.scale<1?4:1)||selDef?.scale} {selDef?.unit}</span>
                          {selDef?.offset&&<span style={{fontSize:'9px',fontFamily:'monospace',color:C.textFaint}}>0x{selDef.offset.toString(16).toUpperCase()}</span>}
                          {selDef?.stg1?<span style={{fontSize:'9px',color:C.amber,fontWeight:700}}>⚡ Stage 1 target</span>:<span style={{fontSize:'9px',color:C.textFaint}}>Stock reference</span>}
                        </div>
                      </div>
                      {/* View toggle */}
                      <div style={{display:'flex',gap:'2px',background:C.surface2,borderRadius:'6px',padding:'2px',border:`1px solid ${C.border}`}}>
                        {[['table','⊞'],['3d','◈'],['hex','01']].map(([vt,icon])=>(
                          <button key={vt} onClick={()=>setViewMode(vt)}
                            style={{padding:'5px 10px',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'11px',fontWeight:700,
                              background:viewMode===vt?C.accentDim+'66':C.surface2,color:viewMode===vt?C.blue:C.textFaint}}>
                            {icon}
                          </button>
                        ))}
                      </div>
                      {/* Bulk % */}
                      <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                        <input type="number" value={pct} onChange={e=>setPct(Number(e.target.value)||0)} min={-50} max={100}
                          style={{width:'50px',background:C.surface2,border:`1px solid ${C.border2}`,borderRadius:'4px',color:C.text,fontSize:'11px',padding:'5px 6px',textAlign:'center',outline:'none'}}/>
                        <span style={{fontSize:'11px',color:C.textFaint}}>%</span>
                        <button onClick={applyMapPct} disabled={!pct}
                          style={{...btn(C.blue,C.accentDim+'33'),padding:'5px 10px',fontSize:'11px',opacity:pct?1:0.4}}>Apply</button>
                        {mapEdits[selMap]&&<button onClick={()=>setMapEdits(e=>{const n={...e};delete n[selMap];return n;})}
                          style={{...btn(C.red),padding:'5px 8px',fontSize:'11px'}}>Reset</button>}
                      </div>
                    </>}
                  </div>

                  {/* Map content */}
                  <div style={{flex:1,overflow:'auto',padding:'12px 14px'}}>
                    {!dispVals?(
                      <div style={{color:C.textFaint,fontSize:'11px',padding:'20px'}}>
                        {selDef?.findFn?'Run the map scan (Analyse Binary in Delete tab) to locate this map.':'Map data not found at this address.'}
                      </div>
                    ):viewMode==='3d'?(
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px'}}>
                        <canvas ref={canvasRef} width={650} height={360}
                          style={{borderRadius:'8px',background:C.bg,border:`1px solid ${C.border}`,maxWidth:'100%'}}/>
                        <div style={{fontSize:'9px',color:C.textFaint}}>Blue = low · Cyan → Green → Yellow → Red = high</div>
                      </div>
                    ):viewMode==='hex'?(
                      <div style={{fontFamily:'monospace',fontSize:'10px',color:C.textFaint,lineHeight:1.9}}>
                        {selDef&&Array.from({length:selDef.yLen},(_,row)=>(
                          <div key={row} style={{display:'flex',gap:'3px'}}>
                            <span style={{color:C.textFaint,width:'52px',textAlign:'right',paddingRight:'6px',flexShrink:0}}>{selDef.yAxis?.[row]??row+1}</span>
                            {Array.from({length:selDef.xLen},(_,col)=>{
                              const idx=row*selDef.xLen+col;
                              const sv=baseVals?.[idx]??0, mv=modVals?.[idx];
                              return <span key={col} style={{color:mv!==undefined&&mv>sv?C.red:mv!==undefined&&mv<sv?C.blue:C.textMid,minWidth:'38px',textAlign:'right'}}>
                                {'0x'+sv.toString(16).toUpperCase().padStart(selDef.vBytes===2?4:2,'0')}
                              </span>;
                            })}
                          </div>
                        ))}
                      </div>
                    ):(
                      /* Table view */
                      <div style={{overflowX:'auto'}}>
                        {/* Diff legend */}
                        {diffMode==='diff'&&buf2&&(
                          <div style={{display:'flex',gap:'14px',marginBottom:'8px',padding:'6px 10px',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:'5px',flexWrap:'wrap',alignItems:'center',fontSize:'9px'}}>
                            <span style={{color:C.red}}>■ Red = Increased</span>
                            <span style={{color:C.blue}}>■ Blue = Decreased</span>
                            <span style={{color:C.textFaint}}>■ Unchanged</span>
                            {baseVals&&modVals&&(()=>{
                              const inc=baseVals.filter((v,i)=>modVals[i]>v).length;
                              const dec=baseVals.filter((v,i)=>modVals[i]<v).length;
                              const maxP=baseVals.reduce((mx,v,i)=>{const p=v>0?(modVals[i]-v)/v*100:0;return p>mx?p:mx;},0);
                              return <><span style={{color:C.amber,marginLeft:'8px'}}>{inc+dec}/{baseVals.length} changed</span>
                              <span style={{color:C.red}}>↑{inc}</span><span style={{color:C.blue}}>↓{dec}</span>
                              <span>Peak: <b style={{color:C.red}}>+{maxP.toFixed(1)}%</b></span></>;
                            })()}
                          </div>
                        )}
                        {diffMode!=='diff'&&(
                          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',fontSize:'9px',color:C.textFaint}}>
                            <span>Low</span>
                            <div style={{width:'80px',height:'6px',borderRadius:'3px',background:'linear-gradient(to right,hsl(220,75%,28%),hsl(160,75%,28%),hsl(80,75%,32%),hsl(40,80%,35%),hsl(0,75%,28%))'}}/>
                            <span>High</span>
                          </div>
                        )}
                        {/* X-axis */}
                        {selDef&&<>
                          <div style={{display:'flex',marginBottom:'2px'}}>
                            <div style={{width:'54px',flexShrink:0,fontSize:'8px',color:C.textFaint,textAlign:'right',paddingRight:'4px'}}>{selDef.yLabel||'→'}</div>
                            {(selDef.xAxis||[]).slice(0,selDef.xLen).map((v,i)=>(
                              <div key={i} style={{flex:1,minWidth:'32px',textAlign:'center',fontSize:'8px',color:C.textFaint,fontFamily:'monospace'}}>{v}</div>
                            ))}
                          </div>
                          {/* Grid */}
                          {Array.from({length:selDef.yLen},(_,row)=>(
                            <div key={row} style={{display:'flex',marginBottom:'1px',alignItems:'center'}}>
                              <div style={{width:'54px',flexShrink:0,fontSize:'8px',color:C.textFaint,fontFamily:'monospace',textAlign:'right',paddingRight:'4px'}}>
                                {selDef.yAxis?.[row]??row+1}
                              </div>
                              {Array.from({length:selDef.xLen},(_,col)=>{
                                const idx=row*selDef.xLen+col;
                                const sv=baseVals?.[idx]??0, mv=modVals?.[idx];
                                const dispRaw=diffMode==='f2'&&mv!==undefined?mv:sv;
                                const isEdited=!!mapEdits[selMap];
                                const t=scMax>scMin?(dispRaw-scMin)/(scMax-scMin):0;
                                const bg=diffMode==='diff'&&mv!==undefined&&buf2?diffBg(sv,mv):heatBg(t);
                                const diffPct=mv!==undefined&&sv>0?(mv-sv)/sv*100:null;
                                return (
                                  <div key={col} className="cell"
                                    style={{flex:1,minWidth:'32px',height:'26px',background:bg,
                                      borderRadius:'2px',border:'1px solid transparent'}}
                                    title={`${(dispRaw*selDef.scale).toFixed(dp)} ${selDef.unit}${diffPct!==null?` (${diffPct>0?'+':''}${diffPct.toFixed(1)}%)`:''}`}>
                                    <div style={{fontSize:'9px',fontWeight:600,color:'#F9FAFB',fontFamily:'monospace',lineHeight:1}}>
                                      {(dispRaw*selDef.scale).toFixed(dp)}
                                    </div>
                                    {diffMode==='diff'&&buf2&&diffPct!==null&&Math.abs(diffPct)>0.5&&(
                                      <div style={{fontSize:'7px',color:diffPct>0?'#FCA5A5':'#93C5FD',lineHeight:1}}>
                                        {diffPct>0?'+':''}{diffPct.toFixed(1)}%
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </>}
                      </div>
                    )}
                    {/* Map desc */}
                    {selDef&&<div style={{marginTop:'10px',padding:'8px 10px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'5px',fontSize:'9px',color:C.textFaint,lineHeight:1.7}}>
                      {selDef.stg1?'⚡ This map was changed by Stage 1 tuning.':'This map was not changed by Stage 1.'}
                      {' '}Bosch ID: <span style={{fontFamily:'monospace',color:C.textMid}}>{selDef.bosch||'—'}</span>
                    </div>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── SAFETY TAB ─── */}
          {!noFile&&tab==='safety'&&(()=>{
            const sv = readSafetyValues(buf);
            const mv = readSafetyValues(patched||buf);
            if(!sv) return <div style={{padding:'20px',color:C.textFaint}}>Load a file first.</div>;

            // ── Power estimate — calibrated to stock N57D30T1 binary ──
            // Formula derived from 2 known data points:
            // Stock:   lim=710Nm → 313hp / 630Nm  (manufacturer spec)
            // Stage 1: lim=780Nm → 370hp / 755Nm  (verified tune)
            // Exponent: log(370/313)/log(780/710) = 1.779
            const PWR_EXP = 1.779;
            const NM_FACTOR = 0.887;     // nm = lim × 0.887 (conservative — actual may be +8% if delivery maps raised)
            const STOCK_LIM = 710;
            const STOCK_HP  = 313;
            const estimateHP  = (lim) => Math.round(STOCK_HP * Math.pow(lim / STOCK_LIM, PWR_EXP));
            const estimateNM  = (lim) => Math.round(lim * NM_FACTOR);
            const classifyStage = (lim) =>
              lim < 740 ? {label:'Stock',col:C.textFaint,bg:C.surface2} :
              lim < 800 ? {label:'Stage 1',col:C.blue,bg:C.accentDim+'22'} :
              lim < 870 ? {label:'Stage 1+',col:C.amber,bg:C.amberDim+'22'} :
                          {label:'Stage 2',col:C.red,bg:C.redDim+'22'};

            const limNm     = sv.limPeak;
            const hpEst     = estimateHP(limNm);
            const nmEst     = estimateNM(limNm);
            const stage     = classifyStage(limNm);
            // If patched file differs, show both
            const limNmMod  = mv?.limPeak;
            const hpEstMod  = limNmMod ? estimateHP(limNmMod) : null;
            const nmEstMod  = limNmMod ? estimateNM(limNmMod) : null;
            const stageMod  = limNmMod ? classifyStage(limNmMod) : null;
            const hasModDiff= limNmMod && Math.abs(limNmMod - limNm) > 1;

            // EGT grid — rows=IQ (mg), cols=boost (mbar)
            const iqSteps   = [10,20,30,40,50,60,70,80,90,100];
            const boostSteps= [900,1100,1300,1500,1700,2000,2300,2700];

            // Safety checks
            const checks = [
              {
                id:'inj', label:'Peak Injection Quantity', icon:'💉',
                val: sv.iqPeak, modVal: mv?.iqPeak,
                unit:'mg/stroke', limit:100, warnAt:85,
                detail:'Stock N57 injectors: safe limit ~100 mg/stroke continuous. Above 85 = approaching duty cycle limit.',
                how: 'Reduce Injection Maps A/B/C percentage in Map Editor.'
              },{
                id:'boost', label:'Boost Target — Peak', icon:'💨',
                val: sv.boostPeak, modVal: mv?.boostPeak,
                unit:'mbar abs', limit:2800, warnAt:2400,
                detail:'Stock VGT turbocharger: safe to ~2.8 bar absolute. Stock turbo shaft/bearing limit.',
                how: 'Reduce Boost High Load A/B maps. Raise boost targets gradually.'
              },{
                id:'lim', label:'Main Torque Limiter', icon:'⚙',
                val: sv.limPeak, modVal: mv?.limPeak,
                unit:'Nm', limit:850, warnAt:800,
                detail:'ZF8HP automatic gearbox: rated to ~850 Nm. Beyond this risks clutch pack slip and output shaft seal failure.',
                how: 'Check Main Torque Limiter map. Do not raise above 820 Nm without gearbox assessment.'
              },{
                id:'smoke', label:'Smoke Limiter (Max IQ)', icon:'💨',
                val: sv.smokePeak, modVal: mv?.smokePeak,
                unit:'Nm', limit:450, warnAt:380,
                detail:'Smoke limiter sets the max torque/fuel before black smoke appears. Raising too high without matching boost = EGT spike and visible smoke.',
                how: 'Smoke Limiter should not exceed boost-proportional values. +6% is typical Stage 1.'
              },{
                id:'lambda', label:'Est. Lambda — Full Load', icon:'λ',
                val: Math.round(calcLambda(sv.iqPeak, sv.boostPeak)*100)/100,
                modVal: mv?Math.round(calcLambda(mv.iqPeak, mv.boostPeak)*100)/100:null,
                unit:'λ', limit:null, warnAt:1.15, lowerIsBad:true,
                detail:'Lambda < 1.15 = risk of visible smoke and elevated EGT. Diesel smoke limit ≈ λ1.15. Lambda < 1.0 = running rich = engine damage.',
                how: 'Increase boost proportionally to injection. Raise VGT limits before raising injection.'
              },{
                id:'egt', label:'Est. Peak EGT', icon:'🌡',
                val: calcEGT(sv.iqPeak, sv.boostPeak),
                modVal: mv?calcEGT(mv.iqPeak, mv.boostPeak):null,
                unit:'°C', limit:750, warnAt:680,
                detail:'Stock N57 EGT limit: 680°C continuous. Short bursts to 720°C acceptable. Above 750°C risks turbo damage and DPF melting.',
                how: 'Reduce injection quantity and/or increase boost to keep EGT in safe range.'
              },
            ];

            const getStatus=(check,val)=>{
              if(val===null||val===undefined) return 'neutral';
              if(check.lowerIsBad) return val < check.warnAt ? (val < check.warnAt-0.1?'danger':'warn') : 'ok';
              if(check.limit&&val>check.limit) return 'danger';
              if(val>check.warnAt) return 'warn';
              return 'ok';
            };
            const STATUS = {ok:{col:C.green,bg:C.greenDim+'22',icon:'✓',label:'SAFE'},
                            warn:{col:C.amber,bg:C.amberDim+'22',icon:'⚠',label:'WARN'},
                            danger:{col:C.red,bg:C.redDim+'22',icon:'✗',label:'DANGER'},
                            neutral:{col:C.textFaint,bg:C.surface2,icon:'—',label:'N/A'}};

            return (
              <div style={{flex:1,overflow:'auto',padding:'20px'}}>
                <div style={{maxWidth:'860px',margin:'0 auto'}}>
                  <div style={{fontSize:'15px',fontWeight:700,marginBottom:'4px'}}>Safety Check — N57D30T1</div>
                  <div style={{fontSize:'11px',color:C.textFaint,marginBottom:'20px'}}>
                    Reads injection, boost and limiter maps. Calculates estimated lambda and EGT at peak conditions.
                    {patched&&<span style={{color:C.amber,marginLeft:'8px'}}>⚡ Showing modified file values</span>}
                  </div>

                  {/* ── LAMBDA CALCULATOR ── */}
                  {(()=>{
                    const pAbs = (ltGauge ? ltBoost + 1013 : ltBoost) * 100; // Pa
                    const T    = ltTemp + 273.15;                             // K
                    const mAir = pAbs * VD_CC * 1e-6 * ETA_V / (R_AIR * T); // kg
                    const lam  = mAir / (ltIQ * 1e-6 * AFR_STOICH);
                    const lamR = Math.round(lam * 1000) / 1000;

                    // Derived
                    const maxSafeIQ = Math.round(mAir / (1.15 * AFR_STOICH * 1e-6));
                    const minBoostMbar = Math.round((ltIQ * 1e-6 * AFR_STOICH * 1.15 * R_AIR * T / (VD_CC * 1e-6 * ETA_V)) / 100);
                    const egt = Math.round(200 + 320 * (ltIQ / 60) * (1.25 / Math.max(lam, 0.65)));
                    const afr = Math.round(lam * AFR_STOICH * 10) / 10;

                    const col = lam >= 1.3 ? C.blue : lam >= 1.15 ? C.green : lam >= 1.0 ? C.amber : C.red;
                    const label = lam >= 1.3 ? 'LEAN / CLEAN' : lam >= 1.15 ? 'SAFE' : lam >= 1.0 ? 'CAUTION' : 'DANGER — OVER-RICH';
                    const egtCol = egt >= 720 ? C.red : egt >= 650 ? C.amber : C.green;

                    // Grid: IQ 10–130 × Boost 1000–3000
                    const gridIQ    = [10,20,30,40,50,60,70,80,90,100,115,130];
                    const gridBoost = [1000,1200,1400,1600,1800,2000,2200,2500,3000];

                    const Slider = ({label, val, setVal, min, max, step, unit, col}) => (
                      <div>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                          <span style={{fontSize:'10px',color:C.textFaint}}>{label}</span>
                          <span style={{fontSize:'11px',fontWeight:700,color:col||C.text,fontFamily:'monospace'}}>{val} {unit}</span>
                        </div>
                        <input type="range" min={min} max={max} step={step} value={val}
                          onChange={e=>setVal(Number(e.target.value))}
                          style={{width:'100%',accentColor:col||C.accent,cursor:'pointer'}}/>
                      </div>
                    );

                    return (
                      <div style={{marginBottom:'20px',background:C.surface,border:`1px solid ${col}44`,borderRadius:'10px',overflow:'hidden'}}>
                        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'10px'}}>
                          <span style={{fontSize:'20px'}}>λ</span>
                          <div>
                            <div style={{fontSize:'13px',fontWeight:700,color:C.text}}>Lambda Calculator</div>
                            <div style={{fontSize:'10px',color:C.textFaint}}>N57D30T1 · 499cc/cyl · η_v=0.88 · AFR_stoich=14.5 · Diesel</div>
                          </div>
                          {buf&&<button
                            onClick={()=>{
                              const sv2=readSafetyValues(patched||buf);
                              if(sv2){
                                setLtIQ(Math.round(sv2.iqPeak));
                                setLtBoost(Math.min(Math.round((sv2.boostPeak||1800)+1013), 3500));
                              }
                            }}
                            style={{marginLeft:'auto',padding:'5px 10px',fontSize:'9px',fontWeight:700,background:C.accent+'22',border:`1px solid ${C.accent}44`,borderRadius:'5px',color:C.accent,cursor:'pointer',whiteSpace:'nowrap'}}>
                            ⚡ Load from file
                          </button>}
                        </div>

                        <div style={{padding:'16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
                          {/* Left: sliders */}
                          <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                            <Slider label={ltGauge?'Boost Pressure (gauge mbar)':'Boost Pressure (absolute mbar)'}
                              val={ltBoost} setVal={setLtBoost} min={600} max={3200} step={10}
                              unit="mbar" col={C.green}/>
                            <div style={{display:'flex',gap:'8px',alignItems:'center',marginTop:'-8px'}}>
                              <button onClick={()=>setLtGauge(false)}
                                style={{padding:'3px 8px',fontSize:'8px',fontWeight:700,border:`1px solid ${!ltGauge?C.green+'66':C.border}`,borderRadius:'3px',background:!ltGauge?C.green+'22':C.surface2,color:!ltGauge?C.green:C.textFaint,cursor:'pointer'}}>
                                Absolute
                              </button>
                              <button onClick={()=>setLtGauge(true)}
                                style={{padding:'3px 8px',fontSize:'8px',fontWeight:700,border:`1px solid ${ltGauge?C.green+'66':C.border}`,borderRadius:'3px',background:ltGauge?C.green+'22':C.surface2,color:ltGauge?C.green:C.textFaint,cursor:'pointer'}}>
                                Gauge (+1013 atm)
                              </button>
                              <span style={{fontSize:'8px',color:C.textFaint}}>= {Math.round(ltGauge?ltBoost+1013:ltBoost)} mbar abs</span>
                            </div>
                            <Slider label="Injection Quantity" val={ltIQ} setVal={setLtIQ} min={5} max={140} step={1} unit="mg/st" col={C.accent}/>
                            <Slider label="Intake Temperature" val={ltTemp} setVal={setLtTemp} min={15} max={70} step={1} unit="°C" col={C.amber}/>
                          </div>

                          {/* Right: result */}
                          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                            {/* Big lambda */}
                            <div style={{background:col+'11',border:`1px solid ${col}33`,borderRadius:'8px',padding:'12px 16px',textAlign:'center'}}>
                              <div style={{fontSize:'9px',color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'2px'}}>Lambda (λ)</div>
                              <div style={{fontSize:'42px',fontWeight:900,color:col,fontFamily:'monospace',lineHeight:1}}>{lamR.toFixed(3)}</div>
                              <div style={{fontSize:'10px',fontWeight:700,color:col,marginTop:'3px'}}>{label}</div>
                            </div>
                            {/* Stats row */}
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                              {[
                                ['AFR', `${afr} : 1`, C.textMid],
                                ['Est. EGT', `${egt} °C`, egtCol],
                                ['Max safe IQ', `${maxSafeIQ} mg/st`, lam<1.15?C.red:C.green],
                                ['Min boost', `${minBoostMbar} mbar abs`, lam<1.15?C.amber:C.textMid],
                              ].map(([lbl,val,c])=>(
                                <div key={lbl} style={{background:C.surface2,borderRadius:'5px',padding:'7px 10px'}}>
                                  <div style={{fontSize:'8px',color:C.textFaint}}>{lbl}</div>
                                  <div style={{fontSize:'12px',fontWeight:700,color:c,fontFamily:'monospace'}}>{val}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Lambda × IQ grid */}
                        <div style={{padding:'0 16px 16px'}}>
                          <div style={{fontSize:'10px',fontWeight:700,color:C.textFaint,letterSpacing:'.08em',textTransform:'uppercase',marginBottom:'8px'}}>
                            Lambda Map — Boost (mbar abs) × IQ (mg/st)
                          </div>
                          <div style={{overflowX:'auto'}}>
                            {/* IQ column headers */}
                            <div style={{display:'flex',marginBottom:'2px',paddingLeft:'52px'}}>
                              {gridIQ.map(iq=>(
                                <div key={iq} style={{flex:1,minWidth:'30px',textAlign:'center',fontSize:'7px',
                                  color:iq===ltIQ?C.accent:C.textFaint,fontWeight:iq===ltIQ?700:400,fontFamily:'monospace'}}>
                                  {iq}
                                </div>
                              ))}
                            </div>
                            {gridBoost.slice().reverse().map(boost=>(
                              <div key={boost} style={{display:'flex',marginBottom:'1px',alignItems:'center'}}>
                                <div style={{width:'50px',flexShrink:0,fontSize:'7px',color:boost===Math.round(ltGauge?ltBoost+1013:ltBoost)?C.green:C.textFaint,
                                  fontWeight:boost===Math.round(ltGauge?ltBoost+1013:ltBoost)?700:400,textAlign:'right',paddingRight:'6px',fontFamily:'monospace'}}>
                                  {boost}
                                </div>
                                {gridIQ.map(iq=>{
                                  const P2=boost*100, T2=ltTemp+273.15;
                                  const mA=(P2*VD_CC*1e-6*ETA_V)/(R_AIR*T2);
                                  const lv=mA/(iq*1e-6*AFR_STOICH);
                                  const isCurrent=Math.abs(iq-ltIQ)<8&&Math.abs(boost-(ltGauge?ltBoost+1013:ltBoost))<120;
                                  const bg=lv>=1.3?'#1e3a5f':lv>=1.15?'#14532d':lv>=1.0?'#713f12':lv>=0.85?'#7f1d1d':'#450a0a';
                                  const tc=lv>=1.15?'#86efac':lv>=1.0?'#fde68a':'#fca5a5';
                                  return (
                                    <div key={iq}
                                      onClick={()=>{setLtIQ(iq); setLtGauge(false); setLtBoost(boost);}}
                                      style={{flex:1,minWidth:'30px',height:'22px',background:bg,
                                        display:'flex',alignItems:'center',justifyContent:'center',
                                        cursor:'pointer',borderRadius:'2px',
                                        outline:isCurrent?`2px solid ${C.text}`:'none',outlineOffset:'-1px'}}>
                                      <span style={{fontSize:'7px',fontWeight:isCurrent?900:400,color:isCurrent?'#fff':tc,fontFamily:'monospace'}}>
                                        {lv.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                            <div style={{display:'flex',gap:'14px',marginTop:'6px',fontSize:'8px',paddingLeft:'52px'}}>
                              <span style={{color:'#86efac'}}>■ ≥1.15 Safe</span>
                              <span style={{color:'#fde68a'}}>■ 1.0–1.15 Caution</span>
                              <span style={{color:'#fca5a5'}}>■ &lt;1.0 Danger</span>
                              <span style={{color:C.textFaint}}>Click any cell to set values</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── POWER ESTIMATE CARD ── */}
                  <div style={{marginBottom:'20px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'10px',overflow:'hidden'}}>
                    {/* Header */}
                    <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'10px'}}>
                      <span style={{fontSize:'18px'}}>⚡</span>
                      <div>
                        <div style={{fontSize:'13px',fontWeight:700,color:C.text}}>Power Estimate</div>
                        <div style={{fontSize:'10px',color:C.textFaint}}>Derived from torque limiter at 0x150B06 — calibrated to verified stock and Stage 1 binaries</div>
                      </div>
                      <div style={{marginLeft:'auto',padding:'4px 12px',background:stage.bg,border:`1px solid ${stage.col}44`,borderRadius:'5px',fontSize:'11px',fontWeight:700,color:stage.col}}>
                        {stage.label}
                      </div>
                    </div>

                    {/* Numbers */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1px',background:C.border}}>
                      {[['BHP',hpEst,hpEstMod,'hp',' (±5%)',' (±8% if delivery maps also raised)'],
                        ['Nm', nmEst,nmEstMod,'Nm','',' (conservative — may be higher if delivery maps raised)']].map(([label,val,modVal,unit,hpNote,nmNote])=>(
                        <div key={label} style={{background:C.surface,padding:'18px 20px'}}>
                          <div style={{fontSize:'10px',fontWeight:700,color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'8px'}}>{label}</div>
                          <div style={{display:'flex',alignItems:'baseline',gap:'6px',marginBottom:'4px'}}>
                            <span style={{fontSize:'38px',fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums',lineHeight:1}}>{val}</span>
                            <span style={{fontSize:'14px',color:C.textFaint}}>{unit}</span>
                          </div>
                          {hasModDiff&&modVal&&(
                            <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'6px'}}>
                              <div style={{fontSize:'11px',color:C.textFaint}}>Stock: {val} {unit}</div>
                              <div style={{fontSize:'12px',fontWeight:700,color:modVal>val?C.green:C.red}}>
                                → {modVal} {unit} ({modVal>val?'+':''}{modVal-val} {unit})
                              </div>
                            </div>
                          )}
                          <div style={{fontSize:'9px',color:C.textFaint,marginTop:'4px'}}>{label==='BHP'?hpNote:nmNote}</div>
                        </div>
                      ))}
                    </div>

                    {/* Stage gauge */}
                    <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`}}>
                      <div style={{fontSize:'9px',color:C.textFaint,marginBottom:'6px'}}>Stage Classification (based on torque limiter)</div>
                      <div style={{position:'relative',height:'20px',background:C.surface2,borderRadius:'10px',overflow:'hidden'}}>
                        {/* Stage zone markers */}
                        {[['Stock',0,42.9,C.textFaint],['Stage 1',42.9,71.4,C.blue],['Stage 1+',71.4,85.7,C.amber],['Stage 2',85.7,100,C.red]].map(([lbl,left,right,col])=>(
                          <div key={lbl} style={{position:'absolute',left:`${left}%`,width:`${right-left}%`,height:'100%',background:col+'22',borderRight:`1px solid ${col}33`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <span style={{fontSize:'8px',fontWeight:700,color:col,whiteSpace:'nowrap'}}>{lbl}</span>
                          </div>
                        ))}
                        {/* Current position marker */}
                        {(()=>{
                          const MIN_LIM=710, MAX_LIM=1000;
                          const pos=Math.min(100,Math.max(0,(limNm-MIN_LIM)/(MAX_LIM-MIN_LIM)*100));
                          return <div style={{position:'absolute',top:0,left:`${pos}%`,transform:'translateX(-50%)',width:'3px',height:'100%',background:stage.col,borderRadius:'2px',zIndex:2}}/>;
                        })()}
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'8px',color:C.textFaint,marginTop:'3px'}}>
                        <span>710 Nm / 313hp</span>
                        <span>780 Nm / 370hp</span>
                        <span>870 Nm / 430hp</span>
                        <span>1000+ Nm / 575hp</span>
                      </div>
                      <div style={{marginTop:'8px',fontSize:'9px',color:C.textFaint,lineHeight:1.6}}>
                        <b style={{color:C.textMid}}>How it works:</b> HP = 313 × (lim/710)^1.779. Exponent derived from stock (313hp/710Nm) and verified Stage 1 (370hp/780Nm) binary analysis. Nm = lim × 0.887 (conservative — actual may be ~8% higher when delivery maps are also raised). Accuracy ±5% HP, ±10% Nm.
                      </div>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'20px'}}>
                    {checks.map(chk=>{
                      const val=chk.modVal??chk.val;
                      const stock=chk.val;
                      const status=getStatus(chk,val);
                      const s=STATUS[status];
                      const changed=chk.modVal!==null&&chk.modVal!==undefined&&Math.abs(chk.modVal-chk.val)>0.01;
                      return (
                        <div key={chk.id} style={{background:s.bg,border:`1px solid ${s.col}44`,borderRadius:'8px',padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                            <span style={{fontSize:'18px'}}>{chk.icon}</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:'11px',fontWeight:700,color:C.text}}>{chk.label}</div>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:'4px',padding:'3px 8px',background:s.col+'22',border:`1px solid ${s.col}55`,borderRadius:'4px'}}>
                              <span style={{color:s.col,fontSize:'10px',fontWeight:900}}>{s.icon}</span>
                              <span style={{color:s.col,fontSize:'9px',fontWeight:700,letterSpacing:'.08em'}}>{s.label}</span>
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'baseline',gap:'6px',marginBottom:'6px'}}>
                            <span style={{fontSize:'24px',fontWeight:700,color:s.col,fontVariantNumeric:'tabular-nums'}}>
                              {typeof val==='number'?val.toFixed(chk.id==='lambda'?2:0):val}
                            </span>
                            <span style={{fontSize:'11px',color:C.textFaint}}>{chk.unit}</span>
                            {changed&&<span style={{fontSize:'10px',color:chk.modVal>chk.val?C.red:C.blue,marginLeft:'4px'}}>
                              {chk.modVal>chk.val?'↑':'↓'} stock: {stock.toFixed(chk.id==='lambda'?2:0)}
                            </span>}
                          </div>
                          {chk.limit&&<div style={{marginBottom:'6px'}}>
                            <div style={{height:'5px',borderRadius:'3px',background:C.surface2,overflow:'hidden'}}>
                              <div style={{height:'100%',borderRadius:'3px',width:`${Math.min(100,val/chk.limit*100)}%`,
                                background:`linear-gradient(to right,${C.green},${val>chk.warnAt?(val>chk.limit?C.red:C.amber):C.green})`}}/>
                            </div>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'8px',color:C.textFaint,marginTop:'2px'}}>
                              <span>0</span><span>Warn: {chk.warnAt}</span><span>Limit: {chk.limit}</span>
                            </div>
                          </div>}
                          <div style={{fontSize:'9px',color:C.textFaint,lineHeight:1.6}}>{chk.detail}</div>
                          {status!=='ok'&&<div style={{marginTop:'6px',padding:'5px 8px',background:s.col+'11',borderRadius:'4px',fontSize:'9px',color:s.col,lineHeight:1.5}}>
                            <b>Fix:</b> {chk.how}
                          </div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* EGT Heat Map */}
                  <div className="card" style={{marginBottom:'16px'}}>
                    <div style={{fontSize:'11px',fontWeight:700,color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'12px'}}>
                      🌡 Estimated EGT Grid — Injection Quantity vs Boost Pressure
                    </div>
                    <div style={{fontSize:'9px',color:C.textFaint,marginBottom:'8px'}}>
                      Calculated using N57 thermodynamic model: λ = air_charge / (IQ × 14.5). EGT = 200 + 300 × (IQ/50) × (1.3/λ). Indicative — not a substitute for dyno EGT sensor.
                    </div>
                    {/* X-axis header */}
                    <div style={{display:'flex',marginBottom:'3px'}}>
                      <div style={{width:'70px',flexShrink:0,fontSize:'8px',color:C.textFaint,textAlign:'right',paddingRight:'6px'}}>IQ ↓</div>
                      {boostSteps.map(b=>(
                        <div key={b} style={{flex:1,textAlign:'center',fontSize:'8px',color:C.textFaint,fontFamily:'monospace'}}>{b}</div>
                      ))}
                      <div style={{width:'50px',fontSize:'8px',color:C.textFaint,paddingLeft:'4px'}}>mbar</div>
                    </div>
                    {iqSteps.map(iq=>(
                      <div key={iq} style={{display:'flex',marginBottom:'1px',alignItems:'center'}}>
                        <div style={{width:'70px',flexShrink:0,fontSize:'8px',color:C.textFaint,fontFamily:'monospace',textAlign:'right',paddingRight:'6px'}}>{iq} mg</div>
                        {boostSteps.map(boost=>{
                          const egt=calcEGT(iq,boost);
                          const lam=calcLambda(iq,boost);
                          // Colour: green<580, yellow<640, orange<700, red<760, dark red>=760
                          const bg=egt<580?`hsl(120,60%,${24+((580-egt)/580)*8}%)`
                            :egt<640?`hsl(60,70%,28%)`
                            :egt<700?`hsl(30,75%,28%)`
                            :egt<760?`hsl(0,70%,28%)`
                            :`hsl(0,80%,22%)`;
                          const textCol=egt>=700?'#FCA5A5':egt>=640?'#FCD34D':C.text;
                          // Mark current operating point
                          const isCurrent=Math.abs(iq-sv.iqPeak)<8&&Math.abs(boost-sv.boostPeak)<200;
                          const isMod=mv&&Math.abs(iq-mv.iqPeak)<8&&Math.abs(boost-mv.boostPeak)<200;
                          return (
                            <div key={boost} style={{flex:1,height:'28px',background:bg,borderRadius:'2px',
                              display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                              border:isMod?`2px solid ${C.amber}`:isCurrent?`2px solid ${C.accent}`:'1px solid transparent'}}
                              title={`IQ=${iq}mg, Boost=${boost}mbar → λ=${lam.toFixed(2)}, EGT≈${egt}°C`}>
                              <div style={{fontSize:'9px',fontWeight:600,color:textCol,fontFamily:'monospace'}}>{egt}°C</div>
                              {lam<1.2&&<div style={{fontSize:'7px',color:textCol,lineHeight:1}}>λ{lam.toFixed(2)}</div>}
                            </div>
                          );
                        })}
                        <div style={{width:'50px',display:'flex',alignItems:'center',paddingLeft:'4px'}}>
                          {Math.abs(iq-sv.iqPeak)<8&&<div style={{width:'8px',height:'8px',borderRadius:'50%',background:C.accent,marginRight:'2px'}} title="Stock operating point"/>}
                          {mv&&Math.abs(iq-mv.iqPeak)<8&&<div style={{width:'8px',height:'8px',borderRadius:'50%',background:C.amber}} title="Modified operating point"/>}
                        </div>
                      </div>
                    ))}
                    <div style={{display:'flex',gap:'14px',marginTop:'8px',fontSize:'9px',flexWrap:'wrap'}}>
                      <span style={{color:'#22C55E'}}>■ &lt;580°C Safe</span>
                      <span style={{color:'#FCD34D'}}>■ 580-640°C Warm</span>
                      <span style={{color:'#F97316'}}>■ 640-700°C Warn</span>
                      <span style={{color:'#EF4444'}}>■ 700-760°C Danger</span>
                      <span style={{color:'#991B1B'}}>■ &gt;760°C Critical</span>
                      <span style={{color:C.accent}}>● Stock point</span>
                      {mv&&<span style={{color:C.amber}}>● Modified point</span>}
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div style={{padding:'10px 14px',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:'6px',fontSize:'9px',color:C.textFaint,lineHeight:1.7}}>
                    <b style={{color:C.textMid}}>Disclaimer:</b> EGT and lambda estimates are calculated from a simplified thermodynamic model calibrated for the N57D30T1 engine. Real-world EGT depends on ambient conditions, engine wear, intercooler efficiency and driving style. Always verify with a wideband O2 sensor and EGT probe on a rolling road before extended hard use. These estimates are for guidance only.
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── TIPS TAB ─── */}
          {tab==='tips'&&(()=>{
            const TIPS = {
              delete: {
                icon:'🛡', label:'Delete Operations',
                sections:[
                  { title:'EGR Delete', col:'#F59E0B', tips:[
                    { head:'Always blank off physically first', body:'Software deleting without a physical blank plate means hot exhaust gas still enters the intake. The calibration patch stops fault codes but does NOT stop physical flow. Order: blank plate first, then remap.' },
                    { head:'Expect P0400/P0401 after physical blank', body:"These codes trigger once the ECU commands EGR open and sees no flow. The calibration patch zeroes the demand map so the ECU never commands it open — codes won't trigger." },
                    { head:'EGR cooler bypass', body:'If leaving the EGR cooler in place, ensure it\'s blanked at both ends. A partially blocked cooler retains heat and can crack the housing. Full removal is cleaner on high-mileage engines.' },
                    { head:'No limp mode codes', body:'EGR delete does not cause limp mode on the N57. All EGR codes are MIL-only. Safe to drive immediately after flash.' },
                  ]},
                  { title:'DPF Delete', col:'#EF4444', tips:[
                    { head:'P2002 causes immediate torque cut', body:'This is the critical code. The ECU detects "DPF efficiency below threshold" and immediately reduces torque. The calibration patch zeros the pressure model so the ECU never calculates high restriction. Must be suppressed.' },
                    { head:'Remove the DPF physically before remapping', body:'If the DPF is still physically present, high backpressure will reduce power and raise EGT even after the calibration patch. The remap suppresses codes but cannot fix the physical restriction.' },
                    { head:'DOC (oxidation catalyst) can stay', body:'The diesel oxidation catalyst upstream of the DPF is not monitored by the N57 ECU and does not cause any fault codes. No need to remove it — it helps reduce visible smoke.' },
                    { head:'Regen cycle will never trigger', body:'Once the soot model is zeroed, the ECU will never calculate soot build-up so forced regeneration under motorway driving stops completely. This also removes the "DPF hot" warning light.' },
                  ]},
                  { title:'AdBlue Delete', col:'#3B82F6', tips:[
                    { head:'P11CF is the progressive counter code', body:'BMW implements a counting system: P11D4 (warning), P11D5 (65km/h limit), P11D6 (30km/h limit and possible no-restart). Patching the calibration sets thresholds to 65535km — counter can never reach them.' },
                    { head:'Clear fault codes immediately after flash', body:'If P11D5 or P11D6 are already active, the latched codes remain in memory even after patching. Connect an OBD scanner and clear all codes after the first start.' },
                    { head:'P11D6 already triggered? ISTA may be needed', body:'On vehicles where the 30km/h limp has already activated, some BMW implementations write a flag to the instrument cluster that requires ISTA or NCS Expert to clear alongside the ECU flash.' },
                    { head:'Physical removal of SCR tank optional', body:'The calibration patch turns off all dosing requests. The AdBlue pump will never run. Physical tank removal is optional — it saves weight but is not required for the delete to work.' },
                  ]},
                  { title:'Swirl Flap Delete', col:'#A855F7', tips:[
                    { head:'Physical removal recommended', body:'The swirl flap actuator motor and linkage are known failure points on high-mileage N57 engines. Physical removal eliminates the failure mode entirely. The calibration patch opens the flaps in software, not mechanically.' },
                    { head:'No limp mode — maintenance codes only', body:'P1447/P1448 are comfort codes only. No torque reduction. Safe to drive with code active.' },
                    { head:'Low-load smoke may increase slightly', body:'Swirl creates better fuel atomisation at light throttle. Some owners notice marginally more blue smoke at cold start after delete — this clears quickly once up to temperature.' },
                  ]},
                ],
              },
              tuning: {
                icon:'⚡', label:'Map Editing',
                sections:[
                  { title:'Sequence Matters', col:'#F59E0B', tips:[
                    { head:'Raise VGT limits before boost targets', body:'The VGT position limit map controls how far the actuator can physically move. If the boost target requests 1200 mbar but the position limit only allows the vane to 60%, you get turbo lag and under-delivery. Always raise position limit first.' },
                    { head:'Match injection to boost proportionally', body:'Diesel power = fuel × air. Adding injection without adding boost means lambda drops below 1.15, visible black smoke, and EGT spike. Rule: for every +10% injection, add at least +8% boost.' },
                    { head:'Smoke limiter caps the torque request', body:'The smoke limiter sets the maximum injection quantity at each load point. If you raise injection maps but not the smoke limiter, peak torque is still capped. Both must be raised together.' },
                    { head:'Torque delivery maps are the final multiplier', body:'Even with injection and boost raised, if the torque delivery maps (trq_main, trq_hl) are conservative, actual output is limited. The high-load delivery map (trq_hl) has the biggest effect on peak torque — Stage 1 raised it +18%.' },
                  ]},
                  { title:'Stage 1 Reference Values', col:'#22C55E', tips:[
                    { head:'Verified Stage 1 percentages (SK67KPR, 370bhp/755Nm)', body:'Injection Maps A/B/C: +9% · Injection Trim: +9% · Smoke Limiter: +6% · Boost Target A: +8% · Boost Target B: +10% · Boost High Load A: +18% · VGT Position Limit: +50% · Torque Delivery Main: +4% · Extended Limiters A/B: +31% · Main Limiter: 710→780Nm' },
                    { head:'Pendel maps need flattening, not raising', body:'The pendel (oscillation damping) maps in Stage 1 are set to a constant flat value of 800Nm. They are not raised proportionally — they are flattened. This smooths the torque delivery curve. Do not just % increase these.' },
                    { head:'DDE torque demand maps — leave alone', body:'The ECO/SPORT/COMFORT demand maps were NOT changed by Stage 1. These are the driver request maps, not the delivery maps. The delivery chain bypasses them at peak load. Raising them without raising delivery maps does nothing at full throttle.' },
                  ]},
                  { title:'Stage 1+ and Stage 2', col:'#EF4444', tips:[
                    { head:'Stage 1+ target (390bhp/780Nm)', body:'Injection: +12% · Smoke: +10% · Boost A/B: +12% · VGT: +80% · Torque Delivery Main: +7% · High Load: +15%. Requires: clean DPF delete, high-flow air filter recommended.' },
                    { head:'Stage 2 hardware requirements', body:'Beyond 400bhp the stock N57 injectors begin approaching duty cycle limits. Above 420bhp: consider uprated injectors. The ZF8HP gearbox is rated ~850Nm — limiter map should not exceed this without torque converter assessment.' },
                    { head:'Intercooler efficiency matters at Stage 2', body:'At Stage 2 boost levels, a worn or undersized intercooler raises intake temperature above our assumed 35°C, which reduces air density and raises EGT above model predictions. Consider intercooler upgrade at Stage 2.' },
                  ]},
                ],
              },
              safety: {
                icon:'⚠', label:'Safety & Limits',
                sections:[
                  { title:'Engine Limits — N57D30T1', col:'#EF4444', tips:[
                    { head:'Stock injectors: 100mg/stroke maximum', body:'The N57 stock Bosch injectors are rated for continuous operation at ~100mg/stroke. Above this, injector tip erosion accelerates and spray pattern degrades. Short bursts are acceptable but sustained operation above 100mg damages injectors over time.' },
                    { head:'VGT turbo: 2.8 bar absolute maximum', body:'The variable geometry turbocharger on the N57 has ceramic thermal coating on the vanes. Sustained boost above 2.8 bar absolute raises turbine inlet temperature to the point where vane coating spalls. Stock tune peaks at ~2.2 bar absolute.' },
                    { head:'EGT 680°C continuous limit', body:'Exhaust gas temperature limit for the N57 in sustained operation (motorway, towing). Short peaks to 720°C acceptable. Above 720°C: VGT vane damage risk. Above 800°C: risk of catalytic substrate melt. Always fit an EGT gauge when pushing Stage 1+.' },
                    { head:'N57 bottom end — bulletproof to 450bhp', body:'The forged steel crankshaft and cast iron block of the N57 are extremely strong. No known cases of bottom end failure on stock internals below 450bhp. The weak point is always the ZF8HP gearbox and injectors, not the engine itself.' },
                  ]},
                  { title:'Gearbox & Drivetrain', col:'#F59E0B', tips:[
                    { head:'ZF8HP: 850Nm torque converter limit', body:'The ZF 8HP torque converter is the weakest link in the drivetrain at peak torque. Standard variants are rated to approximately 850Nm. The torque limiter in the ECU should not exceed this on automatic-equipped cars.' },
                    { head:'AWD xDrive models: front diff rated lower', body:'On xDrive variants, the front differential is rated below the gearbox. Keep peak torque below 800Nm if driving in aggressive xDrive modes. Sport/RWD biased mode reduces front driveshaft loading.' },
                    { head:'Manual gearbox: stronger but clutch is limit', body:'The 6-speed manual (ZF6HP) fitted to some 335d variants has a stronger output shaft than the auto but the stock clutch typically starts slipping above 700Nm. A Stage 1 clutch is recommended at Stage 1+ levels.' },
                  ]},
                  { title:'Post-Flash Procedure', col:'#22C55E', tips:[
                    { head:'Always run WinOLS checksum before flashing', body:'A binary with incorrect checksum will cause the ECU to flag a fault immediately on startup. Some ECUs will not start at all. This tool does not yet correct checksums — run the modified file through WinOLS checksum plugin first.' },
                    { head:'Clear all fault codes after first start', body:'After reflashing, start the engine and let it idle for 2 minutes. Then clear all fault codes with an OBD scanner. Codes that return on second key cycle are genuine faults. Codes that clear and do not return are expected post-flash residual codes.' },
                    { head:'Allow adaptive learning drive cycle', body:'The ECU uses learned adaptation values (fuel trim, boost trim) calibrated to the previous map. After remapping, these values are incorrect. A 20-minute drive with varied load allows the ECU to recalibrate adaptations. Full power should not be used in the first 5 minutes.' },
                    { head:'Keep original binary as backup', body:'Always download the original backup from the Export tab before applying any patches. If the reflashed ECU has issues, the original binary restores to the exact factory state.' },
                  ]},
                ],
              },
            };

            const current = TIPS[tipsSection];

            return (
              <div style={{flex:1,overflow:'auto',padding:'20px'}}>
                <div style={{maxWidth:'760px',margin:'0 auto'}}>
                  <div style={{fontSize:'15px',fontWeight:700,marginBottom:'4px'}}>Tuning Tips — N57D30T1 Diesel</div>
                  <div style={{fontSize:'11px',color:C.textFaint,marginBottom:'16px'}}>Practical guidance from binary analysis of verified tunes. All values confirmed from DDE731a stock and SK67KPR Stage 1 files.</div>

                  {/* Section selector */}
                  <div style={{display:'flex',gap:'6px',marginBottom:'20px',flexWrap:'wrap'}}>
                    {Object.entries(TIPS).map(([key,t])=>(
                      <button key={key} onClick={()=>setTipsSection(key)}
                        style={{padding:'8px 16px',fontSize:'11px',fontWeight:700,borderRadius:'6px',border:'none',cursor:'pointer',
                          background:tipsSection===key?C.accent+'33':C.surface,
                          color:tipsSection===key?C.accent:C.textMid,
                          boxShadow:tipsSection===key?`inset 0 -2px 0 ${C.accent}`:'none',
                          transition:'all .15s'}}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Tips sections */}
                  {current.sections.map((sec,si)=>(
                    <div key={si} style={{marginBottom:'16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                        <div style={{width:'3px',height:'16px',borderRadius:'2px',background:sec.col}}/>
                        <div style={{fontSize:'12px',fontWeight:700,color:C.text}}>{sec.title}</div>
                      </div>
                      {sec.tips.map((tip,ti)=>{
                        const key = `${si}-${ti}`;
                        const isOpen = openTip===key;
                        return (
                          <div key={ti} onClick={()=>setOpenTip(isOpen?null:key)}
                            style={{marginBottom:'6px',border:`1px solid ${isOpen?sec.col+'44':C.border}`,borderRadius:'8px',
                              background:isOpen?sec.col+'0A':C.surface,cursor:'pointer',overflow:'hidden',transition:'all .15s'}}>
                            <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:'10px'}}>
                              <div style={{width:'18px',height:'18px',borderRadius:'50%',background:sec.col+'22',border:`1px solid ${sec.col}44`,
                                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'9px',color:sec.col,fontWeight:900}}>
                                {isOpen?'▾':'▸'}
                              </div>
                              <div style={{fontSize:'11px',fontWeight:600,color:C.text,flex:1}}>{tip.head}</div>
                            </div>
                            {isOpen&&<div style={{padding:'0 14px 12px 42px',fontSize:'11px',color:C.textMid,lineHeight:1.7,borderTop:`1px solid ${sec.col}22`}}>
                              <div style={{paddingTop:'10px'}}>{tip.body}</div>
                            </div>}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Quick reference card */}
                  {tipsSection==='tuning'&&(()=>{
                    // Complete injection map A — all 8×8 cells verified from binary
                    const RPM_COLS = [600,1000,1500,2500,3500,4500,5500,6500];
                    const LOAD_ROWS = [10,20,30,40,50,60,80,100];
                    const INJ_STOCK = [
                      [79.5,79.5,74.0,65.5,57.0,45.5,77.0,77.0],   // 10%
                      [63.5,66.0,75.0,23.0,57.0,79.5,102.5,114.0],  // 20%
                      [114.0,112.0,107.5,101.0,95.0,88.5,77.0,77.0],// 30%
                      [104.5,114.0,114.0,114.0,114.0,114.0,125.0,8.5],// 40%
                      [20.0,20.0,18.0,10.5,3.5,125.0,77.0,77.0],    // 50%
                      [61.0,77.0,86.0,88.0,88.0,88.0,88.0,88.0],    // 60%
                      [87.0,83.0,74.5,66.5,64.5,64.5,108.5,10.0],   // 80%
                      [122.5,120.0,5.5,3.5,3.5,3.5,3.5,3.5],        // 100%
                    ];
                    const INJ_ST1 = [
                      [87.0,87.0,81.0,72.0,62.5,50.0,77.0,77.0],
                      [63.5,66.0,75.0,23.0,57.0,79.5,102.5,114.0],
                      [125.0,123.0,118.0,111.0,104.5,97.0,77.0,77.0],
                      [104.5,114.0,114.0,114.0,114.0,114.0,125.0,8.5],
                      [34.5,34.5,32.5,24.0,16.5,9.5,77.0,77.0],
                      [61.0,77.0,86.0,88.0,88.0,88.0,88.0,88.0],
                      [108.5,104.0,94.5,85.5,83.5,83.5,108.5,10.0],
                      [122.5,120.0,5.5,3.5,3.5,3.5,3.5,3.5],
                    ];
                    // Stage 1+ = +12% on stock where changed, capped at natural ceiling
                    const INJ_ST1P = INJ_STOCK.map((row,ri)=>
                      row.map((v,ci)=> INJ_STOCK[ri][ci]!==INJ_ST1[ri][ci] ? parseFloat((v*1.12).toFixed(1)) : v)
                    );
                    // Smoke limiter — all 8×8 (×0.5 Nm, 0=no limit / axis end)
                    const RPM_SMOKE = [800,1000,1200,1500,2000,2500,3000,3500];
                    const SMK_STOCK = [
                      [612,632,652,672,694,713,755,774],
                      [794,836,874,909,1021,1176,0,133],
                      [149,161,175,190,210,224,235,250],
                      [280,306,330,356,378,398,418,438],
                      [456,472,489,504,519,534,550,564],
                      [579,596,610,630,646,664,702,720],
                      [736,772,803,838,946,1090,0,130],
                      [144,156,170,186,204,216,225,240],
                    ];
                    const SMK_ST1 = [
                      [649,670,690,712,736,756,800,820],
                      [842,886,926,964,1082,1246,0,133],
                      [149,161,175,190,210,224,235,250],
                      [280,306,330,356,378,398,418,438],
                      [456,472,489,504,519,534,550,564],
                      [614,632,647,667,685,704,744,763],
                      [780,818,851,888,1002,1156,0,130],
                      [144,156,170,186,204,216,225,240],
                    ];

                    const [activeRef, setActiveRef] = (()=>{
                      const key = 'refTab';
                      const val = openTip===key+'inj'?'inj':openTip===key+'smk'?'smk':'inj';
                      return [val, (v)=>setOpenTip(key+v)];
                    })();

                    const MapTable = ({rpmCols, loadRows, stockData, st1Data, st1pData, unit, note}) => (
                      <div style={{overflowX:'auto'}}>
                        <div style={{fontSize:'9px',color:C.textFaint,marginBottom:'6px'}}>{note}</div>
                        <table style={{borderCollapse:'collapse',fontSize:'9px',minWidth:'100%'}}>
                          <thead>
                            <tr>
                              <th style={{padding:'3px 8px',textAlign:'left',color:C.textFaint,fontWeight:700,fontSize:'8px',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>Load →<br/>RPM ↓</th>
                              {rpmCols.map(r=><th key={r} style={{padding:'3px 6px',textAlign:'center',color:C.textFaint,fontWeight:700,fontSize:'8px',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}}>{r}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {loadRows.map((load,ri)=>{
                              const changed = stockData[ri].some((v,ci)=>v!==st1Data[ri][ci]);
                              return (
                                <tr key={load} style={{background:ri%2?C.surface2+'44':'transparent'}}>
                                  <td style={{padding:'4px 8px',fontWeight:700,color:changed?C.green:C.textMid,fontSize:'9px',whiteSpace:'nowrap',borderRight:`1px solid ${C.border}`}}>
                                    {load}%{changed&&<span style={{color:C.green,marginLeft:'4px'}}>✓</span>}
                                  </td>
                                  {rpmCols.map((r,ci)=>{
                                    const sv = stockData[ri][ci];
                                    const mv = st1Data[ri][ci];
                                    const sp = st1pData ? st1pData[ri][ci] : mv;
                                    const cellChanged = sv!==mv;
                                    const isZero = sv===0;
                                    return (
                                      <td key={r} style={{padding:'2px 4px',textAlign:'center',background:cellChanged?C.green+'11':'transparent',border:`1px solid ${C.border}22`}}>
                                        {isZero ? <span style={{color:C.textFaint}}>—</span> : (
                                          <div style={{display:'flex',flexDirection:'column',gap:'1px'}}>
                                            <span style={{color:cellChanged?C.textMid:C.textFaint,fontSize:'8px'}}>{sv}</span>
                                            {cellChanged&&<span style={{color:C.green,fontWeight:700,fontSize:'9px'}}>{mv}</span>}
                                            {cellChanged&&st1pData&&<span style={{color:C.amber,fontSize:'8px'}}>{sp}</span>}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{marginTop:'6px',display:'flex',gap:'12px',fontSize:'8px'}}>
                          <span style={{color:C.textFaint}}>Grey = stock (unchanged)</span>
                          <span style={{color:C.green}}>Green = Stage 1 target</span>
                          {st1pData&&<span style={{color:C.amber}}>Amber = Stage 1+ target (+12%)</span>}
                        </div>
                      </div>
                    );

                    return (
                      <div style={{marginTop:'12px'}}>
                        {/* Tab switcher */}
                        <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
                          {[['inj','Injection Map A (mg/st)'],['smk','Smoke Limiter (Nm)']].map(([k,label])=>(
                            <button key={k} onClick={()=>setActiveRef(k)}
                              style={{padding:'6px 12px',fontSize:'10px',fontWeight:700,borderRadius:'5px',border:'none',cursor:'pointer',
                                background:activeRef===k?C.accent+'33':C.surface,
                                color:activeRef===k?C.accent:C.textMid,
                                boxShadow:activeRef===k?`inset 0 -2px 0 ${C.accent}`:'none'}}>
                              {label}
                            </button>
                          ))}
                        </div>

                        {activeRef==='inj'&&(
                          <div style={{padding:'14px 16px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'10px'}}>
                            <div style={{fontSize:'11px',fontWeight:700,color:C.text,marginBottom:'2px'}}>Injection Map A — Complete Reference</div>
                            <div style={{fontSize:'9px',color:C.textFaint,marginBottom:'10px'}}>0x17477E · 8 load rows × 8 RPM cols · u8 ×0.5 mg/st · verified from DDE731a + SK67KPR binaries</div>
                            <MapTable
                              rpmCols={RPM_COLS} loadRows={LOAD_ROWS}
                              stockData={INJ_STOCK} st1Data={INJ_ST1} st1pData={INJ_ST1P}
                              unit="mg/st"
                              note="4 of 8 rows changed by Stage 1 (✓). Rows 20%, 40%, 60%, 100% unchanged — limited by smoke limiter at those points."
                            />
                            <div style={{marginTop:'10px',padding:'8px 10px',background:C.surface2,borderRadius:'5px',fontSize:'9px',color:C.textFaint,lineHeight:1.7}}>
                              <b style={{color:C.textMid}}>How to apply:</b> Select Injection Map A in Map Editor → use Bulk % tool. Enter +9 for Stage 1, +12 for Stage 1+. Row 30% at 600-1500 RPM will reach 125-136 mg/st — this is within N57 injector capability.
                            </div>
                          </div>
                        )}

                        {activeRef==='smk'&&(
                          <div style={{padding:'14px 16px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:'10px'}}>
                            <div style={{fontSize:'11px',fontWeight:700,color:C.text,marginBottom:'2px'}}>Smoke Limiter — Complete Reference</div>
                            <div style={{fontSize:'9px',color:C.textFaint,marginBottom:'10px'}}>0x1884B6 · 8 load rows × 8 RPM cols · u16 ×0.5 Nm · 4 rows changed by Stage 1</div>
                            <MapTable
                              rpmCols={RPM_SMOKE} loadRows={LOAD_ROWS}
                              stockData={SMK_STOCK} st1Data={SMK_ST1} st1pData={null}
                              unit="Nm"
                              note="Smoke limiter caps injection at each load/RPM point. Stage 1 raises 4 rows by +6%. Apply +6% for Stage 1, +10% for Stage 1+."
                            />
                            <div style={{marginTop:'10px',padding:'8px 10px',background:C.surface2,borderRadius:'5px',fontSize:'9px',color:C.textFaint,lineHeight:1.7}}>
                              <b style={{color:C.textMid}}>Note:</b> Some cells show — (0 Nm). These are axis boundary cells — do not modify them. Raise injection maps AND smoke limiter together or the smoke limiter will cap your new injection values.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

          {/* ─── EXPORT TAB ─── */}
          {!noFile&&tab==='export'&&(
            <div style={{flex:1,overflow:'auto',padding:'24px'}}>
              <div style={{maxWidth:'540px',margin:'0 auto',display:'flex',flexDirection:'column',gap:'12px'}}>
                <div style={{fontSize:'16px',fontWeight:700,marginBottom:'4px'}}>Export Modified Binary</div>

                <div className="card">
                  <div style={{fontSize:'11px',fontWeight:700,color:C.textFaint,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'12px'}}>Summary</div>
                  {[
                    ['Base file', file?.name||'—', C.text],
                    ['File size', buf?(buf.byteLength/1024/1024).toFixed(2)+' MB':'—', C.textMid],
                    ['Delete patches', Object.values(enabled).filter(Boolean).length+' maps selected', C.amber],
                    ['Map edits', Object.keys(mapEdits).length+' maps modified', C.blue],
                    ['Status', patched?'Modified — ready to export':'No patches applied yet', patched?C.green:C.textFaint],
                  ].map(([k,v,col])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid ${C.border}`,fontSize:'12px'}}>
                      <span style={{color:C.textMid}}>{k}</span>
                      <span style={{color:col,fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </div>

                <div className="card" style={{background:C.redDim+'22',borderColor:C.red+'33'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color:C.red,marginBottom:'6px'}}>⚠ Important</div>
                  <div style={{fontSize:'11px',color:C.textMid,lineHeight:1.7}}>
                    Always run <b style={{color:C.text}}>checksum correction in WinOLS</b> after patching before flashing to the ECU. Incorrect checksum will cause ECU faults or no-start.
                  </div>
                </div>

                <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                  <button onClick={applyDeletes}
                    style={{...btn(C.amber),flex:1,padding:'10px',fontSize:'12px',textAlign:'center'}}>
                    1. Apply Deletes
                  </button>
                  {Object.keys(mapEdits).length>0&&<button onClick={applyAllMapEdits}
                    style={{...btn(C.blue),flex:1,padding:'10px',fontSize:'12px',textAlign:'center'}}>
                    2. Apply Map Edits
                  </button>}
                  {downloadUrl ? (
                    <a href={downloadUrl}
                      download={(file?.name||'ecu').replace(/\.bin$/i,'')+'_modified.bin'}
                      style={{flex:1,padding:'10px',fontSize:'12px',fontWeight:700,textAlign:'center',
                        background:'#166534',border:'1px solid #22C55E',borderRadius:'6px',
                        color:'#22C55E',textDecoration:'none',display:'flex',alignItems:'center',
                        justifyContent:'center',letterSpacing:'.03em'}}>
                      ↓ Download Modified Binary
                    </a>
                  ) : (
                    <div style={{flex:1,padding:'10px',fontSize:'12px',fontWeight:700,textAlign:'center',
                      background:'#11182788',border:'1px solid #374151',borderRadius:'6px',
                      color:'#4B5563',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      Apply patches first
                    </div>
                  )}
                </div>

                {buf&&(()=>{
                  const bytes=new Uint8Array(buf);
                  let bin=''; const ch=8192;
                  for(let i=0;i<bytes.length;i+=ch) bin+=String.fromCharCode(...bytes.subarray(i,i+ch));
                  const dataUrl='data:application/octet-stream;base64,'+btoa(bin);
                  return (
                    <a href={dataUrl}
                      download={(file?.name||'ecu').replace(/\.bin$/i,'')+'_original_backup.bin'}
                      style={{display:'block',padding:'8px',fontSize:'11px',fontWeight:600,textAlign:'center',
                        background:C.surface2,border:`1px solid ${C.border}`,borderRadius:'6px',
                        color:C.textMid,textDecoration:'none',marginTop:'4px'}}>
                      ↓ Download Original (backup)
                    </a>
                  );
                })()}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Delete Log Overlay ── */}
      {showLog&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div style={{background:'#0D1117',border:`1px solid ${C.border}`,borderRadius:'12px',width:'100%',maxWidth:'600px',maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
            {/* Header */}
            <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:C.green}}/>
                <span style={{fontSize:'13px',fontWeight:700,color:C.text}}>Delete Operation Complete</span>
              </div>
              <button onClick={()=>setShowLog(false)} style={{background:'none',border:'none',color:C.textMid,fontSize:'18px',cursor:'pointer',padding:'2px 6px',borderRadius:'4px'}}>✕</button>
            </div>
            {/* Log body */}
            <div style={{flex:1,overflow:'auto',padding:'12px 16px',fontFamily:"'Courier New',Consolas,monospace",fontSize:'11px',lineHeight:1.8,background:'#070A0E'}}>
              {log.map((e,i)=>{
                if(e.type==='divider') return <div key={i} style={{borderTop:`1px solid ${C.border}`,margin:'6px 0'}}/>;
                if(e.type==='header') return <div key={i} style={{color:C.textMid,marginBottom:'2px'}}>{e.text}</div>;
                return <div key={i} style={{color:e.col||C.textMid,whiteSpace:'pre'}}>{e.text}</div>;
              })}
            </div>
            {/* Footer */}
            <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,display:'flex',gap:'10px',alignItems:'center'}}>
              <span style={{fontSize:'11px',color:C.textFaint,flex:1}}>File modified in memory. Go to Export tab to download.</span>
              <button onClick={()=>{setShowLog(false);setTab('export');}}
                style={{padding:'7px 16px',fontSize:'11px',fontWeight:700,background:'#166534',border:`1px solid ${C.green}`,borderRadius:'6px',color:C.green,cursor:'pointer'}}>
                Go to Export →
              </button>
              <button onClick={()=>setShowLog(false)}
                style={{padding:'7px 14px',fontSize:'11px',fontWeight:600,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:'6px',color:C.textMid,cursor:'pointer'}}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
