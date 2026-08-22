# WonderLLM S3

MakeCode extension for the Hiwonder WonderLLM S3 AI module. The extension is
structured like the official WonderCam extension and communicates with the AI
module over I2C address `0x55`.

## Wiring

| AIModule | micro:bit |
| --- | --- |
| SDA | P20 |
| SCL | P19 |
| GND | GND |

Connect power according to the module specification and ensure that both boards
share ground.

## Usage

Add the extension to MakeCode:

```text
https://github.com/Actor116/WonderLLM_S3#v0.0.1
```

Run `AIModule.init()` once at startup, register MCP tools with `setMCP()`, and
then call `mcpSettingFinish()`.

```blocks
AIModule.init()
AIModule.setMCP("self.device.set_light_brightness", "Call this tool when you want to set light brightness", "[[set_light_brightness, int, 0, 255]]", "false", "false")
AIModule.mcpSettingFinish()
```

## License

MIT
