import 'dotenv/config'
import {setupTPLink} from "./provision-tplink";
import process from "process";
import yargs from 'yargs/yargs';
import {hideBin} from 'yargs/helpers';


let cancelProvisioning = false
export const assertNotCancelled = () => {
    if (cancelProvisioning) {
        cancelProvisioning = false
        throw new Error("cancelled by user")
    }
}

let lastProgress = 0;
export const status = (status: string, progress?: number) => {
    if (progress) lastProgress = progress
    console.log({progress: lastProgress, status})
}
export const statusError = (error: string | any, screenshot?: Buffer) => {
    const s = {
        error: error.toString ? error.toString() : (error.message || (error + "")),
        screenshot: screenshot?.toString('base64')
    }
    console.log(s)
}


interface Args {
    hostname: string;
    ssid: string;
    psk: string;
}

// Configure yargs to parse positional arguments
const argv = yargs(hideBin(process.argv))
    .scriptName("main")
    .usage('$0 <hostname> <ssid> <psk>', 'Provision a tp-link router', (yargs) => {
        return yargs
            .positional('hostname', {
                type: 'string',
                demandOption: true,
            })
            .positional('ssid', {
                type: 'string',
                demandOption: true,
            })
            .positional('psk', {
                type: 'string',
                demandOption: true,
            });
    })
    .help()
    .alias('help', 'h')
    .argv as unknown as Args;
checkArguments(argv);

function checkArguments(args: Args) {
    if (!/^[a-zA-Z0-9]([\-_a-zA-Z0-9]*[a-zA-Z0-9])?$/.test(args.hostname)) {
        console.error("Hostname must be a valid hostname: A-Za-z0-9 and -_")
        process.exit(3)
    }
    if (args.psk.length < 8) {
        console.error("PSK must be at least 8 characters")
        process.exit(4)
    }
}

let hostname = process.env.HOSTNAME_PREFIX! + argv.hostname
status("Start provisioning", 0)
setupTPLink({
    password: process.env.MAIN_PASSWORD!,
    alternativePasswords: JSON.parse(process.env.ALTERNATIVE_PASSWORDS!),
    hostname,
    ssid: argv.ssid,
    psk: argv.psk,
}).then(result => {
    if (result === true) {
        status("Success", 100)
    } else {
        const {error, screenshot} = result
        statusError(error || error, screenshot)
    }
}).catch(e => {
    statusError(e)
})
