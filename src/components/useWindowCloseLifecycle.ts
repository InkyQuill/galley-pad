import { useEffect, useEffectEvent, useRef, useState } from "react";
import { listenForAppQuit } from "../tauri/appQuit";
import { listenForWindowCloseRequest } from "../tauri/windowClose";

type Options = {
  recoveryReady: boolean;
  waitForRecovery: () => Promise<void> | null;
  confirm: (signal?: AbortSignal) => Promise<boolean>;
  prepare: () => Promise<void>;
  onError: (error: unknown) => void;
};

export function useWindowCloseLifecycle(options: Options) {
  const [quitApproved, setQuitApproved] = useState(false);
  const quitApprovedRef = useRef(false);
  const waitForRecovery = useEffectEvent(options.waitForRecovery);
  const confirm = useEffectEvent(options.confirm);
  const prepare = useEffectEvent(options.prepare);
  const reportError = useEffectEvent(options.onError);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForWindowCloseRequest(async () => {
      const recovery = waitForRecovery();
      if (recovery) await recovery;
      if (disposed || quitApprovedRef.current) return false;
      const approved = await confirm();
      if (approved && !disposed) await prepare();
      return approved && !disposed;
    }).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    }).catch((error: unknown) => {
      if (!disposed) reportError(error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!options.recoveryReady) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForAppQuit({
      confirm: async (signal) => {
        const confirmed = await confirm(signal);
        if (disposed || signal?.aborted) return false;
        if (confirmed) {
          quitApprovedRef.current = true;
          setQuitApproved(true);
        }
        return confirmed;
      },
      clear: () => prepare(),
      cancelled: () => {
        quitApprovedRef.current = false;
        setQuitApproved(false);
      },
      onError: (error) => {
        if (!disposed) reportError(error);
      },
    }).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    }).catch((error: unknown) => {
      if (!disposed) reportError(error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [options.recoveryReady]);

  return { quitApproved, quitApprovedRef };
}
