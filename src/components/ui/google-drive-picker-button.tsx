/// <reference types="@types/gapi" />
/// <reference types="@types/google.picker" />

"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCallback, useEffect, useState, useRef } from "react";
import { env } from "@/env.js";
import Image from "next/image";

const GOOGLE_API_KEY = env.NEXT_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;


const SCOPES = "https://www.googleapis.com/auth/drive.readonly";
const OAUTH_TOKEN_KEY = "googleOauthToken";

type GoogleDrivePickerButtonProps = {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
};

export function GoogleDrivePickerButton({
  onFilesSelected,
  disabled = false,
}: GoogleDrivePickerButtonProps) {
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scriptsLoaded = useRef({ gapi: false, gis: false });

  const onFilesSelectedRef = useRef(onFilesSelected);
  onFilesSelectedRef.current = onFilesSelected;

  const pickerCallback = useCallback(
    async (data: google.picker.ResponseObject) => {
      if (data.action === google.picker.Action.CANCEL) {
        console.log("Google Picker: User cancelled.");
        return;
      }

      if (data.action !== google.picker.Action.PICKED) {
        if (data.action !== "loaded") {
          console.warn("Unhandled picker action or data:", data);
        }
        return;
      }

      setError(null);
      setIsProcessing(true);
      setDownloadProgress(0);

      const filesToFetch =
        data.docs
          ?.map((doc) => ({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
          }))
          .filter((doc) => !!doc.id && !!doc.name) ?? [];

      if (filesToFetch.length === 0) {
        setIsProcessing(false);
        setDownloadProgress(null);
        if (data.docs && data.docs.length > 0) {
          setError("No valid files selected or files were missing details.");
        }
        return;
      }

      const token = window.gapi.client.getToken();
      if (!token?.access_token) {
        setError(
          "Authentication error: Cannot fetch files. Please try authenticating again.",
        );
        setIsProcessing(false);
        setDownloadProgress(null);
        return;
      }

      const fetchedFiles: File[] = [];
      let firstError: string | null = null;

      for (let i = 0; i < filesToFetch.length; i++) {
        const fileToFetch = filesToFetch[i];
        try {
          if (!fileToFetch) return;
          const res = await window.gapi.client.drive.files.get({
            fileId: fileToFetch.id,
            alt: "media",
          });

          if (res.status !== 200 || !res.body) {
            let errorBody = "Unknown error";
            if (typeof res.body === "string") errorBody = res.body;
            else if (res.result?.error) {
              errorBody =
                typeof res.result.error === "string"
                  ? res.result.error
                  : (res.result.error as { message: string }).message;
            }
            throw new Error(
              `Failed to download file ${fileToFetch.name}. Status: ${res.status}. Body: ${errorBody}`,
            );
          }
          const len = res.body.length;
          const bytes = new Uint8Array(len);
          for (let j = 0; j < len; j++) {
            bytes[j] = res.body.charCodeAt(j);
          }

          const contentType =
            res.headers?.["content-type"] ??
            fileToFetch.mimeType ??
            "application/octet-stream";
          const blob = new Blob([bytes.buffer], { type: contentType });
          fetchedFiles.push(
            new File([blob], fileToFetch?.name ?? "", { type: contentType }),
          );
        } catch (fetchError: any) {
          console.error(
            `Error fetching file ${fileToFetch?.name ?? "unknown"} from Google Drive:`,
            fetchError,
          );
          if (!firstError) {
            firstError = `Error downloading some files. Check console for details.`;
          }
        }
        setDownloadProgress(((i + 1) / filesToFetch.length) * 100);
      }

      if (firstError) {
        setError(firstError);
      }

      if (fetchedFiles.length > 0) {
        onFilesSelectedRef.current(fetchedFiles);
      } else if (filesToFetch.length > 0 && !firstError) {
        setError("Could not retrieve any of the selected files.");
      }
      setIsProcessing(false);
      setDownloadProgress(null);
    },
    [],
  );

  const createPicker = useCallback(() => {
    if (!gapiLoaded || !window.google?.picker || !window.gapi?.client) {
      setError("Google Picker API not fully initialized.");
      return;
    }

    const token = window.gapi.client.getToken();
    if (!token?.access_token || !GOOGLE_API_KEY) {
      setError("Missing authentication token or API key.");
      return;
    }

    const pickerBuilder = new window.google.picker.PickerBuilder()
      .setDeveloperKey(GOOGLE_API_KEY)
      .setOAuthToken(token.access_token)
      .addView(
        new window.google.picker.DocsView(
          window.google.picker.ViewId.DOCS_IMAGES_AND_VIDEOS,
        ).setMimeTypes(
          "image/png,image/jpeg,image/jpg,image/gif,image/webp,image/heic,image/heif,image/svg+xml",
        ),
      )
      .setLocale("en")
      .setCallback(pickerCallback);

    pickerBuilder.enableFeature(
      window.google.picker.Feature.MULTISELECT_ENABLED,
    );
    pickerBuilder.enableFeature(window.google.picker.Feature.NAV_HIDDEN);

    const picker = pickerBuilder.build();
    picker.setVisible(true);
  }, [gapiLoaded, pickerCallback]);

  const createPickerRef = useRef(createPicker);
  createPickerRef.current = createPicker;

  useEffect(() => {
    let isMounted = true;

    const loadScript = (src: string, id: "gapi" | "gis") => {
      return new Promise<void>((resolve, reject) => {
        if (scriptsLoaded.current[id]) return resolve();
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          scriptsLoaded.current[id] = true;
          resolve();
        };
        script.onerror = () =>
          reject(new Error(`Failed to load ${id.toUpperCase()} script`));
        document.body.appendChild(script);
      });
    };

    const initializeGapiClient = () => {
      return new Promise<void>((resolve, reject) => {
        window.gapi.load("client:picker", {
          callback: resolve,
          onerror: reject,
        });
      });
    };

    const initializeDriveApi = () => {
      return window.gapi.client.load("drive", "v3");
    };

    const initializeApis = async () => {
      try {
        await Promise.all([
          loadScript("https://apis.google.com/js/api.js", "gapi"),
          loadScript("https://accounts.google.com/gsi/client", "gis"),
        ]);
        if (!isMounted) return;

        await initializeGapiClient();
        if (!isMounted) return;

        await initializeDriveApi();
        if (!isMounted) return;

        try {
          const storedTokenData = localStorage.getItem(OAUTH_TOKEN_KEY);
          if (storedTokenData) {
            const { token, expiry } = JSON.parse(storedTokenData);
            if (token && expiry && Date.now() < expiry) {
              window.gapi.client.setToken({ access_token: token });
            } else {
              localStorage.removeItem(OAUTH_TOKEN_KEY);
            }
          }
        } catch (e) {
          console.error("Failed to parse stored token:", e);
          localStorage.removeItem(OAUTH_TOKEN_KEY);
        }

        setGapiLoaded(true);

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: (tokenResponse) => {
            if (!isMounted) return;
            if (tokenResponse?.access_token) {
              const expiresIn = tokenResponse.expires_in;
              if (expiresIn) {
                const expiryTime =
                  Date.now() + parseInt(String(expiresIn), 10) * 1000;
                localStorage.setItem(
                  OAUTH_TOKEN_KEY,
                  JSON.stringify({
                    token: tokenResponse.access_token,
                    expiry: expiryTime,
                  }),
                );
              }
              window.gapi.client.setToken(tokenResponse);
              createPickerRef.current();
            } else if ((tokenResponse as any).error) {
              const responseError = tokenResponse as any;
              console.error(
                "GIS Token Error:",
                responseError.error,
                responseError.error_description,
              );
              setError(`Authentication error: ${responseError.error}`);
            }
          },
          error_callback: (error) => {
            if (!isMounted) return;
            console.error("GIS Error:", error);
            setError(`Authentication error: ${error.type}`);
          },
        });
        setTokenClient(client);
      } catch (error: any) {
        if (!isMounted) return;
        console.error("API Initialization Error:", error);
        setError(`Failed to initialize Google APIs: ${error.message}`);
      }
    };

    initializeApis();

    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleAuthClick = useCallback(() => {
    setError(null);
    if (!tokenClient) {
      console.error("Google Identity Services client not initialized.");
      setError(
        "Google authentication is not ready. Please try again in a moment.",
      );
      return;
    }

    if (window.gapi?.client?.getToken()?.access_token) {
      createPicker();
    } else {
      tokenClient.requestAccessToken({ prompt: "consent" });
    }
  }, [tokenClient, createPicker]);

  const handleClick = () => {
    setError(null);
    if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID) {
      setError(
        "Google Drive integration is not configured. Admin: Check API Key/Client ID.",
      );
      return;
    }
    if (!gapiLoaded || !tokenClient) {
      setError(
        "Google services are still loading. Please wait a moment and try again.",
      );
      return;
    }
    handleAuthClick();
  };

  const buttonDisabled =
    disabled || isProcessing || !gapiLoaded || !tokenClient;
  const buttonText = isProcessing
    ? `Downloading... ${downloadProgress?.toFixed(0) ?? 0}%`
    : error
      ? "Error! Retry?"
      : "Import from Google Drive";

  return (
    <div className="flex flex-col items-start space-y-2 w-full">
      <Button
        onClick={handleClick}
        disabled={buttonDisabled}
        variant="outline"
        className="w-full"
      >
        <Image
          src="https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-64dp/logo_drive_2020q4_color_2x_web_64dp.png"
          alt="Google Drive Logo"
          width={24}
          height={24}
          className="h-5 w-5"
        />
        {buttonText}
      </Button>
      {isProcessing && downloadProgress !== null && (
        <Progress value={downloadProgress} className="w-full h-2" />
      )}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 px-1">{error}</p>
      )}
    </div>
  );
}

// Consolidated type declarations for Google APIs
interface PickerBuilderInstance {
  setDeveloperKey: (key: string) => PickerBuilderInstance;
  setOAuthToken: (token: string) => PickerBuilderInstance;
  addView: (view: unknown) => PickerBuilderInstance;
  setLocale: (locale: string) => PickerBuilderInstance;
  setCallback: (
    callback: (data: google.picker.ResponseObject) => void,
  ) => PickerBuilderInstance;
  setAppId: (appId: string) => PickerBuilderInstance;
  enableFeature: (feature: string) => PickerBuilderInstance;
  build: () => {
    setVisible: (visible: boolean) => void;
  };
}

interface DocsViewInstance {
  setMimeTypes: (mimeTypes: string) => DocsViewInstance;
}

declare global {
  interface Window {
    gapi: {
      load: (
        api: string,
        options: { callback?: () => void; onerror?: (error: any) => void },
      ) => void;
      client: {
        load: (
          api: string,
          version: string,
          options?: {
            callback?: (response?: any) => void;
            onerror?: (error: any) => void;
          },
        ) => void;
        setToken: (token: { access_token: string }) => void;
        getToken: () => { access_token: string } | null;
        drive: {
          files: {
            get: (params: {
              fileId: string;
              alt: string;
            }) => Promise<{
              status: number;
              body: string;
              headers?: Record<string, string>;
              result?: { error?: string | { message: string } };
            }>;
          };
        };
      };
    };
    google: {
      picker: {
        View: (viewId: string) => unknown;
        ViewId: { DOCS_IMAGES_AND_VIDEOS: string };
        PickerBuilder: new () => PickerBuilderInstance;
        Feature: {
          MULTISELECT_ENABLED: string;
          NAV_HIDDEN: string;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        ResponseObject: {
          action: string;
          docs?: Array<{
            id: string;
            name: string;
            mimeType?: string;
          }>;
        };
        DocumentObject: {
          id: string;
          name: string;
          mimeType?: string;
        };
        DocsView: new (viewId: string) => DocsViewInstance;
      };
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token: string;
              expires_in?: number | string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback: (error: { type: string; message: string }) => void;
          }) => {
            requestAccessToken: (options?: { prompt: string }) => void;
          };
        };
      };
    };
  }
}
