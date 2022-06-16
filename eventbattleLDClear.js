const fs = require('fs'),
    { Client } = require('pg');

require('./damage/battlePrediction.js');
global.currentDir = __dirname;

if (!fs.existsSync(`${global.currentDir}/config/dblogin.json`)) {
    console.error(`Missing database login information, 'config/dblogin.json' doesn't exist!
Set contents to:
{
    "user": "xxx",
    "host": "xxx",
    "database": "xxx",
    "password": "xxx",
    "port": 1234
}`);
    return;
}

if (!fs.existsSync(`${global.currentDir}/config/edges.json`)) {
    console.error(`Missing config/edges.json, grab them from:
https://github.com/KC3Kai/KC3Kai/blob/develop/src/data/edges.json`);
    return;
}

if (!fs.existsSync(`${global.currentDir}/config/idTL.json`)) {
    console.error(`Missing config/idTL.json, you can generate them with KC3 by executing:
let tls = {"equip":{}, "ships":{}};
Object.values(KC3Master.all_ships()).filter((s) => s.api_id < 1500).forEach((s) => {tls.ships[s.api_id] = { "jp": KC3Master.ship(s.api_id).api_name, "en": KC3Meta.shipName(KC3Master.ship(s.api_id).api_name)}});
Object.values(KC3Master.all_slotitems()).forEach((s) => {tls.equip[s.api_id] = { "icon": KC3Master.slotitem(s.api_id).api_type[3], "jp": KC3Master.slotitem(s.api_id).api_name, "en": KC3Meta.gearName(KC3Master.slotitem(s.api_id).api_name)}});
copy(JSON.stringify(tls,0,4));`);
    return;
}

const dblogin = require(`${global.currentDir}/config/dblogin.json`);
const edges = require(`${global.currentDir}/config/edges.json`);
const idTL = require(`${global.currentDir}/config/idTL.json`);

function formatFleetForReplay(fleetObj) {
    return fleetObj.map(shipObj => ({
        "mst_id": shipObj.id,
        "level": shipObj.lvl,
        "equip": shipObj.equips.map(equip => equip > 0 ? equip : 0),
        "kyouka": [shipObj.stats.fp, shipObj.stats.tp, shipObj.stats.aa, shipObj.stats.ar]
    }));
}

function formatLbasForReplay(baseObj, rid) {
    return {
        "rid": rid,
        "action": baseObj.strikepoints.length > 0 ? 1 : 2,
        "planes": baseObj.planes.map(id => ({
            "mst_id": id
        }))
    }
}

function replayExport(fleet, rawapi, apiname, node, map) {

    const o = {
        "world": map.split("-")[0],
        "mapnum": map.split("-")[1],
        "fleetnum": 1,
        "combined": fleet.fleettype,
        "fleet1": formatFleetForReplay(fleet.fleet1),
        "fleet2": [],
        "fleet3": [],
        "fleet4": [],

        "support1": 0,
        "support2": 0
    }
    if (o.combined > 0) {
        o.fleet2 = formatFleetForReplay(fleet.fleet2);
    }
    if (fleet.support) {
        o.fleet4 = formatFleetForReplay(fleet.support);
        o.support2 = 4;
    }

    if (fleet.lbas) {
        o.lbas = fleet.lbas.map(base => formatLbasForReplay(base));
    }
    
    const b = {
        "node": node,
        "data": {},
        "yasen": {}
    };
    if (apiname.includes("midnight")) {
        b["yasen"] = rawapi;
    } else {
        b["data"] = rawapi;
    }
    o.battles = [b];
    return o;
}

if(process.argv.length <= 3) {
    console.log("Usage: node eventbattleLDClear <map> <node>");
    console.log("Generates a replay URL of a LD clear on the specified map and node");
    return;
}

const map = process.argv[2], node = process.argv[3];


let edgesFromNode = Object.keys(edges["World " + map]).filter((edge) => {
    let e = edges["World " + map][edge];
    return e[1] == node;
}).map((edge) => parseInt(edge));


const client = new Client(dblogin);
client.connect();

client.query(`SELECT * FROM eventbattle WHERE map = $1 and node = ANY($2)`, [map, edgesFromNode], (err, data) => {
    if(err) {
        console.log(err);
        client.end();
        return;
    }

    let entries = data.rows;
    for (let instance of entries) {
        
        let isLastDance = false;
        const flagshipID = instance.rawapi.api_ship_ke[0];
        if (((idTL.ships[flagshipID] || {}).jp || "").includes("-壊")) {
            isLastDance = true;
        }

        const isClear = global.isBossKill(instance.rawapi) && isLastDance;

        if (isClear) {
            const replayData = replayExport(instance.fleet, instance.rawapi, instance.apiname, instance.node, instance.map);
            // Line break in boss message preventing direct copy+paste stringified replay data
            const replayLink =  "https://kc3kai.github.io/kancolle-replay/battleplayer.html#" + encodeURIComponent(JSON.stringify(replayData));
            console.debug(replayLink);
            break;
        }
        
    }
    client.end();
});
