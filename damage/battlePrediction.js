const PLAYER_SIDE = 0;
const HOUGEKI_MIDNIGHT_KEYS = ["api_damage", "api_df_list", "api_at_eflag"];
const RAIGEKI_KEYS = ["api_fydam", "api_frai"];
const KOUKU_KEYS = ["api_edam", "api_ebak_flag", "api_erai_flag"];
const PHASES = [
    "api_air_base_injection",
    "api_injection_kouku",
    "api_air_base_attack",
    "api_friendly_kouku",
    "api_kouku",
    "api_kouku2",
    "api_support_info",
    "api_opening_taisen",
    "api_opening_atack",
    "api_hougeki1",
    "api_hougeki2",
    "api_hougeki3",
    "api_raigeki",

    "api_friendly_battle",
    "api_n_support_info",
    "api_hougeki",
    "api_n_hougeki1",
    "api_n_hougeki2"
]

function zip(o) {
    return o[0].map((_, colIndex) => o.map(row => row[colIndex]));
}

function parseHougekiMidnight(damage, defender, side) {
    return {
        "damage": damage,
        "defender": defender,
        "side": side
    }
}

function HougekiMidnight(rawapi) {
    return zip(HOUGEKI_MIDNIGHT_KEYS.map(key => rawapi[key])).map(attack => parseHougekiMidnight(...attack)).filter(obj => obj.side == PLAYER_SIDE);
}

function parseRaigeki(damage, defender) {
    return {
        "damage": Math.floor(damage),
        "defender": defender
    }
}

function Raigeki(rawapi) {
    return zip(RAIGEKI_KEYS.map(key => rawapi[key])).map(attack => parseRaigeki(...attack)).filter(obj => obj.defender > -1 && obj.damage > 0);
}

function parseKouku(defender, damage, baku, raig) {
    return {
        "damage": Math.floor(damage),
        "defender": defender,
        "valid": baku == 1 || raig == 1
    }
}

function Kouku(rawapi) {
    return zip(KOUKU_KEYS.map(key => rawapi[key])).map((attack, idx) => parseKouku(idx, ...attack)).filter(obj => obj.valid);
}

function SupportHougeki(rawapi) {
    return rawapi.api_damage.map((damage, defender) => ({"damage": Math.floor(damage), "defender": defender})).filter(obj => obj.damage > 0);
}

function dealDamage(ehp, attack, offsetCombined = false) {
    const dfOffset = offsetCombined ? 6 : 0;
    if (typeof(attack.damage) == 'object') {
        attack.damage.forEach((dmg, idx) => dmg > 0 ? ehp[attack.defender[idx] + dfOffset] -= Math.floor(dmg) : null);
    } else {
        ehp[attack.defender + dfOffset] -= attack.damage;
    }
}

function simulateBattle(rawapi) {
    const e = {};
    const initialzier = (obj, hp_array, combined) => hp_array ? hp_array.forEach((hp, idx) => obj[idx + (combined ? 6 : 0)] = hp) : null;
    initialzier(e, rawapi.api_e_nowhps);
    const combined = !!rawapi.api_e_nowhps_combined;
    if (combined) {
        initialzier(e, rawapi.api_e_nowhps_combined, true);
    }
    
    for (let phase of PHASES) {
        if (rawapi[phase]) {
            parsePhase(e, phase, rawapi[phase], combined);
        }
    }

    return e;
}

function parsePhase(enemyHP, phase, rawapi, combined) {

    if (phase.includes("hougeki")) {
        HougekiMidnight(rawapi).forEach(attack => dealDamage(enemyHP, attack));

    } else if (phase.includes("raigeki") || phase == "api_opening_atack") {
        Raigeki(rawapi).forEach(attack => dealDamage(enemyHP, attack));

    } else if (phase.includes("kouku") || phase.includes("injection")) {
        if (rawapi.api_stage3) {
            Kouku(rawapi.api_stage3).forEach(attack => dealDamage(enemyHP, attack));
            if (combined && rawapi.api_stage3_combined) {
                Kouku(rawapi.api_stage3_combined).forEach(attack => dealDamage(enemyHP, attack, true));
            }
        }

    } else if (phase == "api_air_base_attack") {
        rawapi.forEach(raw => parsePhase(enemyHP, "kouku", raw, combined));

    } else if (phase == "api_support_info") {
        if (rawapi.api_support_hourai) {
            SupportHougeki(rawapi.api_support_hourai).forEach(attack => dealDamage(enemyHP, attack));
        } else if (rawapi.api_support_airatack) {
            parsePhase(enemyHP, "kouku", rawapi.api_support_airatack, combined);
        }
    }
}

global.isBossKill = rawapi => {
    const ehp = simulateBattle(rawapi);
    return ehp[0] <= 0;
}