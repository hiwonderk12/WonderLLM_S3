/**
 wonderllm_s3 package
 */
//% weight=10 icon="\uf013" color=#ff7f00
namespace wonderllm_s3 {
    const I2C_ADDRESS = 0x55;
    const STATUS_NAMES = ["unknown", "starting", "configuring", "idle", "connecting", "listening", "speaking", "upgrading", "activating", "audio_testing", "fatal_error", "invalid_state"];

    let initialized = false;
    let sendBuffer: Buffer = pins.createBuffer(0);
    let moduleReturn = "";
    let fragments: { data: Buffer[], totalFragments: number, receivedFragments: number }[] = [];
    let lastFragmentTime = 0;

    function calculateChecksum(data: Buffer): number {
        let checksum = 0;
        for (let i = 0; i < data.length; i++) checksum ^= data.getUint8(i);
        return checksum & 0xff;
    }

    function processFragment(fragmentId: number, totalFragments: number, actualData: Buffer): Buffer {
        const currentTime = input.runningTime();
        if (lastFragmentTime > 0 && currentTime - lastFragmentTime > 2000) fragments = [];
        lastFragmentTime = currentTime;

        if (totalFragments === 1) return actualData;
        if (fragmentId === 1) {
            fragments.push({ data: [], totalFragments: totalFragments, receivedFragments: 0 });
        }
        if (fragments.length === 0) return null;

        const fragmentInfo = fragments[fragments.length - 1];
        if (fragmentId < 1 || fragmentId > totalFragments || fragmentInfo.totalFragments !== totalFragments) return null;

        const fragmentIndex = fragmentId - 1;
        if (fragmentInfo.data[fragmentIndex] === undefined) {
            fragmentInfo.data[fragmentIndex] = actualData;
            fragmentInfo.receivedFragments++;
        }
        if (fragmentInfo.receivedFragments !== totalFragments) return null;

        let totalLength = 0;
        for (let i = 0; i < fragmentInfo.data.length; i++) {
            if (fragmentInfo.data[i]) totalLength += fragmentInfo.data[i].length;
        }
        const reassembledData = pins.createBuffer(totalLength);
        let offset = 0;
        for (let i = 0; i < fragmentInfo.data.length; i++) {
            if (fragmentInfo.data[i]) {
                for (let j = 0; j < fragmentInfo.data[i].length; j++) {
                    reassembledData.setUint8(offset++, fragmentInfo.data[i].getUint8(j));
                }
            }
        }
        fragments.pop();
        return reassembledData;
    }

    function receiveCommand() {
        const received = pins.i2cReadBuffer(I2C_ADDRESS, 8);
        if (received.length < 8) return;

        const flag = received.getNumber(NumberFormat.UInt16BE, 0);
        const dataLength = received.getNumber(NumberFormat.UInt16BE, 2);
        const fragmentId = received.getNumber(NumberFormat.UInt16LE, 4);
        const totalFragments = received.getNumber(NumberFormat.UInt16LE, 6);
        if (flag !== 0xaa55 || dataLength <= 0 || dataLength > 8192) {
            basic.pause(100);
            return;
        }

        const dataWithChecksum = pins.i2cReadBuffer(I2C_ADDRESS, dataLength + 1);
        if (dataWithChecksum.length < dataLength + 1) return;
        const actualData = dataWithChecksum.slice(0, dataLength);
        if (dataWithChecksum.getUint8(dataLength) !== calculateChecksum(actualData)) return;

        const reassembledData = processFragment(fragmentId, totalFragments, actualData);
        if (reassembledData !== null) {
            if (reassembledData.length === 1) {
                const statusIndex = reassembledData.getUint8(0);
                if (statusIndex < STATUS_NAMES.length) moduleReturn = STATUS_NAMES[statusIndex];
            } else {
                try {
                    moduleReturn = JSON.stringify(JSON.parse(reassembledData.toString()));
                } catch (e) { }
            }
        }
        basic.pause(100);
    }

    function sendCommand(command: string, params: any) {
        sendBuffer = Buffer.fromUTF8(JSON.stringify({ command: command, params: params }));
        pins.i2cWriteBuffer(I2C_ADDRESS, sendBuffer);
    }

    /** Initialize the AIModule I2C receive service. Run once at startup. */
    //% weight=110 blockId=aimodule_init block="Initialize AIModule"
    export function init() {
        if (initialized) return;
        initialized = true;
        basic.forever(() => receiveCommand());
    }

    /** Register an MCP tool with the AIModule. Tool definitions only support English. */
    //% weight=100 blockId=aimodule_set_mcp block="Set MCP tool |name = %tool_name|command = %command|params = %params|block = %block|return = %have_return"
    //% tool_name.shadow=text command.shadow=text params.shadow=text
    //% tool_name.defl=self.device.set_light_brightness command.defl="Call this tool when you want to set light brightness"
    //% params.defl='[[set_light_brightness, int, 0, 255]]' block.defl=false have_return.defl=false
    export function setMCP(tool_name: string, command: string, params: string, block: string, have_return: string) {
        const message = { tool_name: tool_name, command: command, params: params ? JSON.parse(params) : [], block: block, return: have_return };
        sendBuffer = Buffer.fromUTF8(JSON.stringify(message));
        pins.i2cWriteBuffer(I2C_ADDRESS, sendBuffer);
        basic.pause(50);
    }

    /** Notify the AIModule that MCP configuration is complete. */
    //% weight=99 blockId=aimodule_mcp_setting_finish block="MCP setting finish"
    export function mcpSettingFinish() { basic.pause(100); sendCommand("mcp_setting", "true"); }

    /** Notify the AIModule that the current tool action is complete. */
    //% weight=98 blockId=aimodule_action_finish block="MCP action finish"
    export function actionFinish() { sendCommand("action_finish", "true"); }

    /** Put the AIModule into standby mode. */
    //% weight=97 blockId=aimodule_sleep block="Set AIModule sleep"
    export function sleep() { sendCommand("sleep", "true"); }

    /** Send vision-task parameters to the AIModule. */
    //% weight=96 blockId=aimodule_set_vision block="Set Vision %params"
    //% params.shadow=text
    export function setVision(params: string) { sendCommand("vision", params); }

    /** Send JSON status data to the AIModule. */
    //% weight=95 blockId=aimodule_send_status block="Send status %params to AIModule"
    //% params.shadow=text
    export function sendStatus(params: string) { sendCommand("status", params ? JSON.parse(params) : []); }

    /** Read and clear the last result returned by the AIModule. */
    //% weight=94 blockId=aimodule_get_return block="Get MCP return"
    export function getReturn(): string {
        const result = moduleReturn;
        moduleReturn = "";
        return result;
    }

    /** Get the byte length of the last MCP setting message. */
    //% weight=93 blockId=aimodule_get_setting_length block="Get the parameter length of the MCP setting"
    export function getSettingLength(): number { return sendBuffer.length; }
}
