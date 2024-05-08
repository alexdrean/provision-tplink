import {chromium, Page} from "playwright";

type Task = "Login" | "Hostname" | "WiFi" | "Admin" | "Reset"
type Params = {
    password: string,
    alternativePasswords?: string[],
    hostname: string,
    ssid: string,
    psk: string,
}

export async function setupTPLink(params: Params) {

    const browser = await chromium.launch({headless: true})
    const page = await browser.newPage({viewport: {width: 1280, height: 1280}})
    while (true) {
        try {
            await page.goto("http://192.168.88.1")
            break
        } catch (e) {
            // @ts-ignore
            if (typeof e.message === 'string' && e.message.startsWith("page.goto: net::ERR_ADDRESS_UNREACHABLE")) {} else
                // @ts-ignore
                console.log(e.message || e)
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
        await browser.close()
        return true
    } catch (error) {
        console.error(error)
        const screenshot = await page.screenshot({type: "png"})
        return {error, screenshot}
    }
}

async function login(page: Page, password: string, alternativePasswords?: string[]) {
    if (await page.isVisible("#pc-setPwd-new")) {
        console.log("Create password")
        await page.locator("#pc-setPwd-new").fill(password)
        await page.locator("#pc-setPwd-confirm").fill(password)
        await page.locator("#pc-setPwd-btn").click()
        console.log("Password created")
        return false
    } else if (await page.isVisible("#pc-login-password")) {
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
                return false
            }
        }
        throw new Error("Invalid password")
    } else if (await page.isVisible("#t_regionNote")) {
        console.log("Set region")
        await tpSelectByText(page, "_region", "United States")
        await tpSelectByVal(page, "_timezone", "-07:00")
        await page.click("#next")
        await waitForMaskOff(page)
        return false
    } else if (await page.isVisible("#wan_next")) {
        console.log("Skip everything, click next...")
        await page.click("#wan_next")
        await waitForMaskOff(page)
        while (await page.isHidden("#advanced")) {
            console.log("...click next")
            await page.click("#next")
            await waitForMaskOff(page)
        }
        console.log("Quick setup successful")
        await page.click("#advanced")
        await sleep(0.5)
        return true
    }else if (await page.isVisible("#advanced")) {
        console.log("Click Advanced")
        await page.click("#advanced")
        await sleep(0.5)
        return true
    } else {
        throw new Error("Unknown page while trying to log in")
    }
}

async function loaded(page: Page) {
    await page.waitForLoadState()
    await page.waitForLoadState("networkidle")
}

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

async function setHostname(page: Page, hostname: string) {
    console.log("Go to WAN page")
    await page.click(".ml1 > a[url='ethWan.htm']")
    await page.click(".ml2 > a[url='ethWan.htm']")
    await sleep(1)
    console.log("Open advanced setting")
    await page.click("#multiWanBody span.edit-modify-icon")
    await page.click("#multiWanEdit span.advanced-icon")
    await page.fill("#hostname", hostname)
    await page.click("#saveConnBtn")
    await waitForMaskOff(page)
    await sleep(1)
    console.log("Hostname set to " + hostname)
    return true
}

async function setWiFi(page: Page, ssid: string, psk: string) {
    console.log("Go to wireless page")
    if (await page.isHidden(".ml2 > a[url='wirelessSettings.htm']")) {
        await page.click(".ml1 > a[url='wirelessSettings.htm']")
        await sleep(0.5)
    }
    await page.click(".ml2 > a[url='wirelessSettings.htm']")
    await sleep(1)
    if (await page.isVisible("#enableOfdma")) {
        console.log("Enable OFDMA")
        await toggleRadioButtonTo(page, "enableOfdma", true)
    }
    if (await page.isVisible("#enableTwt")) {
        console.log("Enable TWT")
        await toggleRadioButtonTo(page, "enableTwt", true)
    }
    console.log("Set SSID & PSK")
    await page.fill("#ssid", ssid)
    await tpSelectByText(page, "_sec", "WPA-PSK[TKIP]+WPA2-PSK[AES]")
    await page.fill("#wpa2PersonalPwd", psk)

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
    if (await page.isHidden(".ml2 > a[url='manageCtrl.htm']")) {
        await page.click(".ml1 > a[url='time.htm']")
        await sleep(0.5)
    }
    await page.click(".ml2 > a[url='manageCtrl.htm']")
    await sleep(1)
    if (!await page.isChecked("#remoteHttpEn")) {
        console.log("Set remote http access on")
        await page.click("label[for=remoteHttpEn]")
        await page.click("#t_save3")
        await waitForMaskOff(page)
        await sleep(1);
    }
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

async function waitForMaskOff(page: Page) {
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
