const ESC = "\u001b";
const BEL = "\u0007";
const C1_OSC = "\u009d";
const C1_ST = "\u009c";
const MAX_OSC_LENGTH = 8_192;

type ParserState = "text" | "escape" | "osc" | "osc-escape";

/**
 * Removes Operating System Command sequences from untrusted PTY output.
 *
 * OSC can change titles, create hyperlinks, and carry clipboard-oriented
 * payloads. The parser is stateful because a PTY may split a control sequence
 * across arbitrary output chunks. CSI and other ordinary terminal controls are
 * preserved for xterm rendering.
 */
export class TerminalOutputSanitizer {
  private state: ParserState = "text";
  private oscLength = 0;

  constructor(private readonly blockedControlNotice: string) {}

  push(chunk: string): string {
    let output = "";

    for (const character of chunk) {
      switch (this.state) {
        case "text":
          if (character === ESC) {
            this.state = "escape";
          } else if (character === C1_OSC) {
            this.beginOsc(1);
          } else {
            output += character;
          }
          break;
        case "escape":
          if (character === "]") {
            this.beginOsc(2);
          } else if (character === ESC) {
            output += ESC;
          } else {
            output += ESC + character;
            this.state = "text";
          }
          break;
        case "osc":
          if (character === BEL || character === C1_ST) {
            this.endOsc();
          } else if (character === ESC) {
            this.state = "osc-escape";
            this.oscLength += 1;
          } else {
            this.oscLength += 1;
          }
          break;
        case "osc-escape":
          if (character === "\\" || character === BEL || character === C1_ST) {
            this.endOsc();
          } else if (character === ESC) {
            this.oscLength += 1;
          } else {
            this.state = "osc";
            this.oscLength += 1;
          }
          break;
      }

      if ((this.state === "osc" || this.state === "osc-escape")
          && this.oscLength > MAX_OSC_LENGTH) {
        this.endOsc();
        output += `\r\n${this.blockedControlNotice}\r\n`;
      }
    }

    return output;
  }

  reset() {
    this.state = "text";
    this.oscLength = 0;
  }

  private beginOsc(initialLength: number) {
    this.state = "osc";
    this.oscLength = initialLength;
  }

  private endOsc() {
    this.state = "text";
    this.oscLength = 0;
  }
}
