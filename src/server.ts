import express from "express"
import 'dotenv/config'
import {setupTPLink} from "./provision-tplink";
import process from "process";
import {createServer} from "http";
import {Server} from "socket.io";

const app = express()
const server = createServer(app)
const io = new Server(server)
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
let cancelProvisioning = false
export const assertNotCancelled = () => {
    if (cancelProvisioning) {
        cancelProvisioning = false
        throw new Error("cancelled by user")
    }
}
let provisioningStatus: {status?: string, progress?: number} = {}
export const status = (status: string, progress?: number) => {
    provisioningStatus = {
        status,
        progress: progress ?? provisioningStatus.progress,
    }
    if (progress) console.log(progress + "%", status)
    else console.log(status)
    io.emit("status", provisioningStatus)
}
app.use(express.json())

app.post("/provision", async (req, res) => {
    let {hostname, ssid, psk} = req.body
    if (!hostname === undefined || ssid === undefined || psk === undefined) {
        return res.status(400).send("/provision?hostname=<HOSTNAME>&ssid=<SSID>&psk=<PSK>")
    }
    if (typeof hostname !== 'string') {
        return res.status(400).send("Hostname must be a string")
    }
    if (!/^[a-zA-Z0-9]([\-_a-zA-Z0-9]*[a-zA-Z0-9])?$/.test(hostname)) {
        return res.status(400).send("Hostname must be a valid hostname: A-Za-z0-9 and -_")
    }
    if (typeof ssid !== 'string') {
        return res.status(400).send("SSID must be a string")
    }
    if (typeof psk !== "string" || psk.length < 8) {
        return res.status(400).send("PSK must be at least 8 characters")
    }
    hostname = hostnamePrefix + hostname
    if (isProvisioning) {
        return res.status(503).send("Already provisioning a router");
    }
    isProvisioning = true;
    cancelProvisioning = false
    status("Start provisioning", 0)
    console.log("Start provisioning")
    setupTPLink({
        password: process.env.MAIN_PASSWORD!,
        alternativePasswords,
        hostname,
        ssid,
        psk
    }).then(result => {
        if (result === true) {
            status("Success", 100)
        } else {
            const {error, screenshot} = result
            io.emit("status", {error: error.toString(), screenshot: screenshot?.toString('base64')})
        }
    }).catch(e => {
        console.error(e)
        io.emit("status", {error: e.message || e})
    }).finally(() => {
        isProvisioning = false
        cancelProvisioning = false
        provisioningStatus = {}
    })
    return res.status(202).send("Provisioning requested")
})

app.delete("/provision", async (req, res) => {
    console.log("Cancel requested, isProvisioning="+isProvisioning+", cancelProvisioning=" + cancelProvisioning)
    if (isProvisioning) {
        if (cancelProvisioning) {
            return res.status(409).send("Cancel already requested")
        } else {
            cancelProvisioning = true
            return res.status(202).send("Cancel requested")
        }
    } else {
        return res.status(400).send("Not provisioning")
    }

})

io.on('connect', (socket) => {
    console.log("Client connected")
    socket.emit("status", provisioningStatus)
})
server.listen(port, () => {
    console.log("Listening on port " + port)
})
