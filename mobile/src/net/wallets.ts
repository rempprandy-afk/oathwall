import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { HandoffOutcome } from "./handoffMessage";

/**
 * Handing the owner off to their phone wallet to fund the smart account.
 *
 * WHY TRUST WALLET AND NOT PHANTOM. This used to open Phantom, which carried
 * the previous chain. Phantom does NOT support BNB Smart Chain — its own help
 * centre lists BSC among the "unsupported networks" it walks people through
 * recovering from — so on BNB it is the one wallet this screen must not send
 * anyone to. Trust Wallet holds BNB Smart Chain natively, on the same EVM
 * address it uses everywhere else.
 *
 * WHY THIS IS A COPY-AND-OPEN AND NOT A PREFILLED SEND. EIP-681
 * (`ethereum:0xTOKEN@56/transfer?address=…`) is the standard EVM payment URI,
 * but support is uneven across wallets, and on iOS an unhandled `ethereum:`
 * link doesn't even offer a chooser — it dead-ends on "Safari cannot open the
 * page". So the honest maximum is one tap that copies the address AND opens the
 * wallet, leaving the user a single paste. That is also the pattern that
 * survives every case a deeplink would strand — a different wallet, an
 * exchange withdrawal, a second device — which is why the address stays on
 * screen either way.
 */

/** Trust Wallet's registered custom scheme; bare, it simply opens the app. */
const WALLET_APP_URL = "trust://";

/**
 * Where to land someone who doesn't have the wallet installed. A plain https
 * page, so the fallback is a real page with install links rather than another
 * failure.
 */
const WALLET_WEB_URL = "https://trustwallet.com/download";

/**
 * What actually happened, so the UI can say something true rather than assume.
 * Defined next to the message copy it drives (handoffMessage.ts), which is the
 * pure half — this module can't be imported by the test runner, that one can.
 */
export type HandoffResult = HandoffOutcome;

/**
 * Open Trust Wallet, falling back to its website when it isn't installed.
 *
 * Deliberately drives `openURL` directly and catches, rather than gating on
 * `canOpenURL`. `canOpenURL` is the wrong tool on both platforms: iOS *rejects*
 * for a scheme absent from `LSApplicationQueriesSchemes`, and Android 11+
 * silently answers `false` under package-visibility filtering unless a
 * `<queries>` entry is declared — so it reports "not installed" for a wallet
 * that is. `openURL` is subject to neither restriction, and its rejection is a
 * truthful signal that nothing handled the link. Not gating also keeps this
 * change free of any native config, so it needs no prebuild.
 */
export async function openWallet(): Promise<HandoffResult> {
  try {
    await Linking.openURL(WALLET_APP_URL);
    return "app";
  } catch {
    // Nothing on the device claimed trust:// — almost always "not installed".
    try {
      await Linking.openURL(WALLET_WEB_URL);
      return "web";
    } catch {
      return "failed";
    }
  }
}

/**
 * The funding handoff: put the address on the clipboard, THEN open the wallet,
 * so the user arrives in the wallet with only a paste left to do.
 *
 * Copy first and await it. Opening the wallet backgrounds this app, and on both
 * platforms a clipboard write racing an app switch is a write that may not land
 * — which would drop the user into a send screen with nothing to paste, the
 * exact dead end this function exists to remove.
 *
 * Returns whether the copy succeeded alongside where the user was sent, because
 * the two fail independently and the caller has to be able to say which.
 */
export async function fundWithWallet(
  address: string,
): Promise<{ copied: boolean; opened: HandoffResult }> {
  let copied = false;
  try {
    await Clipboard.setStringAsync(address);
    copied = true;
  } catch {
    // A clipboard refusal must not cancel the handoff — the address is still on
    // screen to read, and the wallet is still the right place to be.
  }
  return { copied, opened: await openWallet() };
}
