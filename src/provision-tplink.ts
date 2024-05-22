import {Browser, chromium, Page} from "playwright";
import {assertNotCancelled, status} from "./server";

type Task = "Login" | "Hostname" | "WiFi" | "Admin" | "Reset"
type Params = {
    password: string,
    alternativePasswords?: string[],
    hostname: string,
    ssid: string,
    psk: string,
}

let browser: Browser;
const DEBUG = process.env.DEBUG ?? false

export async function setupTPLink(params: Params): Promise<true | {error: any, screenshot?: Buffer}> {
    status("Opening browser")
    if (browser && browser.isConnected()) {
        await browser.close()
    }
    browser = await chromium.launch({headless: !DEBUG})
    const page = await browser.newPage({viewport: {width: 1280, height: 1280}})
    page.setDefaultTimeout(30e3)
    status("Connecting to router", 1)
    let i = 0;
    while (true) {
        assertNotCancelled()
        try {
            await page.goto("http://192.168.88.1", {timeout: 3000})
            break
        } catch (e) {
            // @ts-ignore
            if (typeof e.message === 'string' && (e.message.startsWith("page.goto: net::ERR_ADDRESS_UNREACHABLE") || e.message.startsWith("page.goto: Timeout"))) {
                i++
                if (i >= 10) {
                    console.log("Cannot connect to router")
                    return {error: "Cannot connect to router"}
                }
            } else {
                // @ts-ignore
                console.log(e.message || e)
                // @ts-ignore
                return {error: e.message || e}
            }
            await sleep(0.5)
        }
    }
    const tasks: Task[] = [
        "Login",
        "Hostname",
        "WiFi",
        "Admin",
    ]
    try {
        while (tasks.length > 0) {
            await loaded(page)
            let res;
            switch (tasks[0]) {
                case "Login":
                    res = await login(page, params.password, params.alternativePasswords)
                    break
                case "Hostname":
                    res = await setHostname(page, params.hostname)
                    break
                case "WiFi":
                    res = await
                        setWiFi(page, params.ssid, params.psk)
                    break
                case "Admin":
                    res = await setAdmin(page)
                    break
                case "Reset":
                    res = await reset(page)
                    break
            }
            if (res) tasks.shift()
        }
        console.log("All tasks done; success")
        return true
    } catch (error) {
        console.error(error)
        const screenshot = await page.screenshot({type: "png"})
        return {error, screenshot}
    } finally {
        if (!DEBUG)
            browser.close()
    }
}

async function login(page: Page, password: string, alternativePasswords?: string[]) {
    if (await page.isVisible("#pc-setPwd-new")) {
        status("Create password", 5)
        console.log("Create password")
        await page.locator("#pc-setPwd-new").fill(password)
        await page.locator("#pc-setPwd-confirm").fill(password)
        await page.locator("#pc-setPwd-btn").click()
        console.log("Password created")
        status("Password created")
        return false
    } else if (await page.isVisible("#pc-login-password")) {
        status("Log in", 10)
        const passwords = [password, ...alternativePasswords || []]
        for (const pw of passwords) {
            console.log("Log in with password " + pw)
            await page.locator("#pc-login-password").fill(pw)
            await page.locator("#pc-login-btn").click()
            await loaded(page)
            await sleep(0.25)
            if (await page.isVisible("#confirm-yes")) {
                if (await page.locator("#confirm-yes").textContent() === "Log in") {
                    await page.locator("#confirm-yes").click()
                    await loaded(page)
                    await sleep(0.25)
                }
            }
            if (await page.isVisible("#pc-login-password")) {
                console.log("Wrong password")
            } else {
                console.log("Log in successful")
                status("Logged in")
                return false
            }
        }
        throw new Error("Invalid password")
    } else if (await page.isVisible("#t_regionNote")) {
        status("Set region", 15)
        console.log("Set region")
        await tpSelectByText(page, "_region", "United States")
        await tpSelectByVal(page, "_timezone", "-07:00")
        await page.click("#next")
        await waitForMaskOff(page)
        status("Region set")
        return false
    } else if (await page.isVisible("#wan_next")) {
        status("Skip quick setup", 20)
        console.log("Skip everything, click next...")
        await page.click("#wan_next")
        await waitForMaskOff(page)
        let progress = 21
        while (await page.isHidden("#advanced")) {
            status("Skip quick setup", progress++)
            console.log("...click next")
            await page.click("#next")
            await waitForMaskOff(page)
        }
        console.log("Quick setup successful")
        status("Quick setup successful", 30)
        await page.click("#advanced")
        await sleep(0.5)
        return true
    }else if (await page.isVisible("#advanced")) {
        console.log("Click Advanced")
        status("Click advanced", 30)
        await page.click("#advanced")
        await sleep(0.5)
        return true
    } else {
        throw new Error("Unknown page while trying to log in")
    }
}

async function loaded(page: Page) {
    assertNotCancelled()
    await page.waitForLoadState()
    assertNotCancelled()
    await page.waitForLoadState("networkidle")
    assertNotCancelled()
}

const sleep = (seconds: number) => new Promise<void>((resolve, reject) => setTimeout(() => {
    try {assertNotCancelled()} catch (e) {reject(e)}
    resolve()
}, seconds * 1000))

async function setHostname(page: Page, hostname: string) {
    console.log("Go to WAN page")
    status("Go to WAN page", 35)
    await page.click(".ml1 > a[url='ethWan.htm']")
    await page.click(".ml2 > a[url='ethWan.htm']")
    await sleep(1)
    status("Set hostname", 40)
    console.log("Open advanced setting")
    await page.click("#multiWanBody span.edit-modify-icon")
    await page.click("#multiWanEdit span.advanced-icon")
    await page.fill("#hostname", hostname)
    await page.click("#saveConnBtn")
    await waitForMaskOff(page)
    await sleep(1)
    console.log("Hostname set to " + hostname)
    status("Hostname set")
    return true
}

async function setWiFi(page: Page, ssid: string, psk: string) {
    console.log("Go to wireless page")
    status("Go to wireless page", 45)
    if (await page.isHidden(".ml2 > a[url='wirelessSettings.htm']")) {
        await page.click(".ml1 > a[url='wirelessSettings.htm']")
        await sleep(0.5)
    }
    await page.click(".ml2 > a[url='wirelessSettings.htm']")
    await sleep(1)
    if (await page.isVisible("#enableOfdma")) {
        console.log("Enable OFDMA")
        status("Enable OFDMA", 50)
        await toggleRadioButtonTo(page, "enableOfdma", true)
    }
    if (await page.isVisible("#enableTwt")) {
        console.log("Enable TWT")
        status("Enable OFDMA", 60)
        await toggleRadioButtonTo(page, "enableTwt", true)
    }
    status("Set SSID & PSK", 70)
    console.log("Set SSID & PSK")
    await page.fill("#ssid", ssid)
    await tpSelectByText(page, "_sec", "WPA-PSK[TKIP]+WPA2-PSK[AES]")
    await page.fill("#wpa2PersonalPwd", psk)
    status("Set channel width", 75)
    let channelWidth = "20MHz"
    const hwver = await page.locator("#bot_hver").textContent()
    if (hwver !== null && hwver.includes("HX510")) channelWidth = "40MHz"
    console.log("Set bandwidth to " + channelWidth)
    await page.click("#dynAdvClick")
    await tpSelectByVal(page, "_chnwidth_adv_2g", "20MHz")
    await tpSelectByVal(page, "_chnwidth_adv_5g", channelWidth)

    await page.click("#save")
    await waitForMaskOff(page)
    console.log("Wireless sucessful")
    return true
}

async function setAdmin(page: Page) {
    console.log("Go to admin")
    status("Go to admin", 80)
    if (await page.isHidden(".ml2 > a[url='manageCtrl.htm']")) {
        await page.click(".ml1 > a[url='time.htm']")
        await sleep(0.5)
    }
    await page.click(".ml2 > a[url='manageCtrl.htm']")
    await sleep(1)
    status("Set remote access", 90)
    if (!await page.isChecked("#remoteHttpEn")) {
        console.log("Set remote http access on")
        await page.click("label[for=remoteHttpEn]")
        await page.click("#t_save3")
        await waitForMaskOff(page)
        await sleep(1);
    }
    status("Set remote ping", 95)
    if (!await page.isChecked("#pingRemote")) {
        console.log("Set remote ping on")
        await page.click("label[for=pingRemote]")
        await page.click("#t_save4")
        await waitForMaskOff(page)
    }
    console.log("Admin successful")
    return true
}

async function reset(page: Page) {
    console.log("Reset to factory defaults")
    if (await page.isHidden(".ml2 > a[url='backNRestore.htm']")) {
        await page.click(".ml1 > a[url='time.htm']")
        await sleep(0.5)
    }
    await page.click(".ml2 > a[url='backNRestore.htm']")
    await sleep(1)
    await page.click("button#resetBtn")
    await sleep(0.25)
    await page.getByRole("button", {name: "Yes"}).click()
    await sleep(1)
    console.log("Reset successful")
    return true
}


async function tpSelectByText(page: Page, id: string, text: string) {
    const xpath = `//*[@id='${id}']//li[text()='${text.replace(/'/, "\\'")}']`
    await page.click(`#${id} > .tp-select`)
    await page.evaluate(xpath => {
        const e = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
        // @ts-ignore
        e.scrollIntoView()
    }, xpath)
    await sleep(0.25)
    await page.click(xpath)
    await sleep(0.5)
}

async function tpSelectByVal(page: Page, id: string, val: string) {
    const selector = `#${id} li[data-val='${val.replace(/'/, "\\'")}']`
    await page.click(`#${id} > .tp-select`)
    await page.evaluate(selector => {
        document.querySelector(selector)!.scrollIntoView()
    }, selector)
    await sleep(0.25)
    await page.click(selector)
    await sleep(0.5)

}

async function toggleRadioButtonTo(page: Page, id: string, state: boolean) {
    const isOn = await page.locator("#" + id).evaluate(el => el.classList.contains("on"))
    if (isOn !== state) {
        await page.click("#" + id + " div.button-group-wrap")
        await waitForMaskOff(page)
    }
}

async function waitForMaskOff(page: Page, timeout: number = 60000) {
    const _f = async () => {
        while (await page.locator("div#mask").isHidden()) await sleep(0.05)
        let i = 0;
        while (true) {
            await sleep(0.05)
            if (await page.isVisible("div#mask"))
                i = 0
            else
                i++
            if (i >= 10) break
        }
    }
    return Promise.race([_f(), new Promise((_, reject) => {
        setTimeout(() => {
            reject("waitForMaskOff timeout")
        }, timeout)
    })])
}
