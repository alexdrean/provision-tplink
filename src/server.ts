import express from "express"
import 'dotenv/config'
import {setupTPLink} from "./provision-tplink";
import process from "process";

const app = express()
const port = process.env.PORT_TPLINK || 7201

const password = process.env.MAIN_PASSWORD
if (!password) {
    console.error("Please set MAIN_PASSWORD in .env")
    process.exit(1)
}
const alternativePasswords = process.env.ALTERNATIVE_PASSWORDS ? JSON.parse(process.env.ALTERNATIVE_PASSWORDS) : null
const hostnamePrefix = process.env.HOSTNAME_PREFIX ?? ""

app.get("/", (req, res) => {
    res.send("Hello TP-Link world!")
})

let isProvisioning = false
app.use(express.json())
app.use("/provision", (req, res, next) => {
    if (isProvisioning) {
        return res.status(503).send("Already provisioning a router");
    }
    isProvisioning = true;
    res.on("finish", () => { isProvisioning = false; });
    next();
});

app.post("/provision", async (req, res) => {
    let {hostname, ssid, psk} = req.body
    if (!hostname === undefined || ssid === undefined || psk === undefined) {
        return res.status(400).send("/provision?hostname=<HOSTNAME>&ssid=<SSID>&psk=<PSK>")
    }
    if (typeof hostname !== 'string') {
        return res.status(400).send("Hostname must be a string")
    }
    if (typeof ssid !== 'string') {
        return res.status(400).send("SSID must be a string")
    }
    if (typeof psk !== "string" || psk.length < 8) {
        return res.status(400).send("PSK must be at least 8 characters")
    }
    hostname = hostnamePrefix + req.query.hostname
    console.log("Start provisioning")
    setupTPLink({
        password: process.env.MAIN_PASSWORD!,
        alternativePasswords,
        hostname,
        ssid,
        psk
    }).then(result => {
        if (result === true) {
            return res.send("Success")
        } else {
            const {error, screenshot} = result
            const img = screenshot ? "<img src='data:image/png;base64," + screenshot?.toString('base64') + "'></img>" : ""
            return res.status(500).send("<pre>" + error + "</pre>" + img)
        }
    }).catch(e => {
        console.error(e)
        res.status(500).send(e.message || e)
    })
})

app.listen(port, () => {
    console.log("Listening on port " + port)
})
