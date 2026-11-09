// Минимальные типы для chrome.* API, которые использует расширение.
// Полный пакет @types/chrome можно поставить вместо этого файла:
//   npm i -D @types/chrome
// (тогда этот файл можно удалить).

declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      tab?: { id?: number; url?: string };
      id?: string;
    }
    interface InstalledDetails {
      reason: string;
    }
    const id: string;
    const lastError: { message?: string } | undefined;
    function getURL(path: string): string;
    function sendMessage(message: unknown): Promise<any>;
    function openOptionsPage(): Promise<void>;
    const onMessage: {
      addListener(
        cb: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
    };
    const onInstalled: { addListener(cb: (details: InstalledDetails) => void): void };
    const onStartup: { addListener(cb: () => void): void };
  }

  namespace storage {
    interface StorageChange {
      oldValue?: any;
      newValue?: any;
    }
    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, any>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    const local: StorageArea;
    const sync: StorageArea;
    const onChanged: {
      addListener(cb: (changes: Record<string, StorageChange>, areaName: string) => void): void;
    };
  }

  namespace alarms {
    interface Alarm {
      name: string;
    }
    function create(name: string, info: { delayInMinutes?: number; periodInMinutes?: number }): Promise<void>;
    function clear(name: string): Promise<boolean>;
    const onAlarm: { addListener(cb: (alarm: Alarm) => void): void };
  }

  namespace notifications {
    function create(
      id: string,
      options: {
        type: 'basic';
        iconUrl: string;
        title: string;
        message: string;
        contextMessage?: string;
        priority?: number;
      }
    ): Promise<string>;
    function clear(id: string): Promise<boolean>;
    const onClicked: { addListener(cb: (id: string) => void): void };
  }

  namespace tabs {
    function create(props: { url: string; active?: boolean }): Promise<unknown>;
  }

  namespace action {
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  }
}
