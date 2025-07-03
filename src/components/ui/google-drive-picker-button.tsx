/// <reference types="@types/gapi" />
/// <reference types="@types/google.picker" />
/// <reference types="@types/google.accounts" />

"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCallback, useEffect, useState, useRef } from "react";
import { env } from "@/env.js";
import Image from "next/image";
import { Loader2 } from "lucide-react";

const GOOGLE_API_KEY = env.NEXT_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const SCOPES = "https://www.googleapis.com/auth/drive.readonly";
const OAUTH_TOKEN_KEY = 'google_oauth_token';

// Define the shape of the stored token
interface StoredToken {
  token: string;
  expiry: number;
}

// Type guard to check if an object is a valid StoredToken
function isStoredToken(obj: unknown): obj is StoredToken {
  return (
    typeof obj === 'object' && 
    obj !== null &&
    'token' in obj && 
    typeof obj.token === 'string' &&
    'expiry' in obj && 
    typeof obj.expiry === 'number'
  );
}

// Helper function to get token from localStorage
const getStoredToken = (): StoredToken | null => {
  if (typeof window === 'undefined') return null;
  
  const stored = localStorage.getItem(OAUTH_TOKEN_KEY);
  if (!stored) return null;
  
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isStoredToken(parsed)) {
      return {
        token: parsed.token,
        expiry: parsed.expiry
      };
    }
    console.warn('Invalid token format in localStorage');
  } catch (e) {
    console.error('Failed to parse stored token', e);
  }
  return null;
};

// Helper function to store token in localStorage
const storeToken = (token: string, expiresIn: number): void => {
  if (typeof window === 'undefined') return;
  const expiryTime = Date.now() + expiresIn * 1000;
  const tokenData: StoredToken = { token, expiry: expiryTime };
  localStorage.setItem(OAUTH_TOKEN_KEY, JSON.stringify(tokenData));
};

// Helper function to clear stored token
const clearStoredToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(OAUTH_TOKEN_KEY);
};

// Check if token is expired
const isTokenExpired = (expiry: number): boolean => {
  return Date.now() >= expiry;
};

type GoogleDrivePickerButtonProps = {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
};

export function GoogleDrivePickerButton({
  onFilesSelected,
  disabled = false,
}: GoogleDrivePickerButtonProps) {
  const [gapiLoaded, setGapiLoaded] = useState(false);
  // Type the tokenClient state using the interface defined in `declare global`
  const [tokenClient, setTokenClient] =
    useState<google.accounts.oauth2.TokenClient | null>(null);
  const [apiStatus, setApiStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const scriptsLoaded = useRef({ gapi: false, gis: false });
  const initializationErrorRef = useRef<string | null>(null);
  
  const isReady = apiStatus === 'ready';
  const isApiLoading = apiStatus === 'loading';

  const onFilesSelectedRef = useRef(onFilesSelected);
  onFilesSelectedRef.current = onFilesSelected;

  const pickerCallback = useCallback(
    async (data: google.picker.ResponseObject) => {
      // The action is already typed as a string by the ResponseObject type
      const action = data.action;
      
      if (action === 'cancel') {
        console.log("Google Picker: User cancelled.");
        return;
      }

      if (action === 'error') {
        console.error("Google Picker error:", data);
        setError("An error occurred with the Google Picker. Please try again.");
        return;
      }

      if (action !== 'picked') {
        // Log any unexpected actions for debugging
        console.warn("Unhandled picker action:", action);
        return;
      }

      setError(null);
      setIsLoading(true);
      setDownloadProgress(0);

      // Use the official `google.picker.DocumentObject` type and a type guard in the filter
      const filesToFetch =
        data.docs?.filter(
          (
            doc,
          ): doc is google.picker.DocumentObject & { id: string; name: string } =>
            !!doc.id && !!doc.name,
        ) ?? [];

      if (filesToFetch.length === 0) {
        setIsLoading(false);
        setDownloadProgress(0);
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
        setIsLoading(false);
        setDownloadProgress(0);
        return;
      }

      const fetchedFiles: File[] = [];
      let firstError: string | null = null;

      for (let i = 0; i < filesToFetch.length; i++) {
        const fileToFetch = filesToFetch[i]!; // Non-null assertion is safe due to the filter above
        try {
          const res = await window.gapi.client.drive.files.get({
            fileId: fileToFetch.id,
            alt: "media",
          });

          if (res.status !== 200 || !res.body) {
            let errorBody = "Unknown error";
            if (typeof res.body === "string") {
              errorBody = res.body;
            } else if (res.result?.error) {
              // The `error` property can be a string or an object
              errorBody =
                typeof res.result.error === "string"
                  ? res.result.error
                  : res.result.error.message;
            }
            throw new Error(
              `Failed to download file ${fileToFetch.name}. Status: ${res.status}. Body: ${errorBody}`,
            );
          }

          // GAPI returns a string where each char code is a byte. Convert to Uint8Array.
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

          fetchedFiles.push(new File([blob], fileToFetch.name, { type: contentType }));
        } catch (fetchError: unknown) {
          // Catch errors as `unknown` for maximum type safety
          console.error(
            `Error fetching file ${fileToFetch.name} from Google Drive:`,
            fetchError,
          );
          firstError ??= `Error downloading some files. Check console for details.`;
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

      setIsLoading(false);
      setDownloadProgress(0);
    },
    [],
  );

  const createPicker = useCallback(() => {
    if (isApiLoading) {
      // Still loading, do nothing and wait
      return;
    }
    
    if (!isReady || !window.google?.picker || !window.gapi?.client) {
      const errorMsg = "Google Picker API not fully initialized yet. Please wait...";
      setError(errorMsg);
      initializationErrorRef.current = errorMsg;
      return;
    }

    const token = window.gapi.client.getToken();
    if (!token?.access_token || !GOOGLE_API_KEY) {
      setError("Missing authentication token or API key.");
      return;
    }

    // Rely on the official `@types/google.picker` types for the builder
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
      .setCallback((data) => {
        // Explicitly mark the promise as void since we're handling it in the callback
        void (async () => {
          await pickerCallback(data);
        })();
      });

    pickerBuilder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    pickerBuilder.enableFeature(window.google.picker.Feature.NAV_HIDDEN);

    const picker = pickerBuilder.build();
    picker.setVisible(true);
  }, [pickerCallback, isApiLoading, isReady]);

  const createPickerRef = useRef(createPicker);
  createPickerRef.current = createPicker;

  // Function to handle successful authentication
  const handleAuthSuccess = (token: string, expiresIn: number) => {
    storeToken(token, expiresIn);
    if (window.gapi?.client) {
      window.gapi.client.setToken({ access_token: token });
    }
    setIsAuthenticated(true);
    createPickerRef.current();
  };

  useEffect(() => {
    let isMounted = true;

    const loadScript = (src: string, id: "gapi" | "gis") =>
      new Promise<void>((resolve, reject) => {
        if (scriptsLoaded.current[id]) return resolve();
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          scriptsLoaded.current[id] = true;
          resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load ${id.toUpperCase()} script`));
        document.body.appendChild(script);
      });

    const initializeApis = async () => {
      try {
        setApiStatus('loading');
        setError(null);
        
        await Promise.all([
          loadScript("https://apis.google.com/js/api.js", "gapi"),
          loadScript("https://accounts.google.com/gsi/client", "gis"),
        ]);
        if (!isMounted) return;

        // First load the Picker API
        await new Promise<void>((resolve, reject) => window.gapi.load("client:picker", { callback: resolve, onerror: reject }));
        if (!isMounted) return;

        // Then load the Drive API client
        await window.gapi.client.init({});
        await window.gapi.client.load('drive', 'v3');
        
        setGapiLoaded(true);

        // Check for existing token first
        const storedToken = getStoredToken();
        
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          // Use the strongly-typed `TokenResponsePayload` for the callback
          callback: (tokenResponse) => {
            if (!isMounted) return;
            // Use a type guard to differentiate success from error
            if ("access_token" in tokenResponse) {
              handleAuthSuccess(tokenResponse.access_token, Number(tokenResponse.expires_in));
            } else if (tokenResponse.error) {
              console.error("OAuth error:", tokenResponse.error);
              if (isMounted) {
                setError("Authentication failed: " + (tokenResponse.error_description ?? tokenResponse.error));
              }
            }
          },
          error_callback: (error) => {
            console.error("OAuth client error:", error);
            if (isMounted) {
              setError("Authentication error: " + (error.message ?? "Unknown error"));
            }
          },
        });

        setTokenClient(client);

        // If we have a valid stored token, use it
        if (storedToken && !isTokenExpired(storedToken.expiry)) {
          handleAuthSuccess(storedToken.token, (storedToken.expiry - Date.now()) / 1000);
        }
        
        setApiStatus('ready');
        // Clear any initialization errors when API is ready
        if (initializationErrorRef.current) {
          setError(null);
          initializationErrorRef.current = null;
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("API Initialization Error:", error);
        // Use `instanceof Error` for safer error message access
        if (error instanceof Error) {
          setError(`Failed to initialize Google APIs: ${error.message}`);
        } else {
          setError("An unknown error occurred during API initialization.");
        }
      }
    };

    // Handle the promise and any potential errors
    initializeApis().catch((error) => {
      console.error('Failed to initialize Google APIs:', error);
      if (isMounted) {
        setError('Failed to initialize Google APIs. Please try again.');
      }
    });

    return () => { isMounted = false; };
  }, []);

  const handleAuthClick = useCallback(() => {
    if (!gapiLoaded || !tokenClient) {
      setError("Google API not fully initialized.");
      return;
    }
    // Clear any existing token to force re-authentication
    clearStoredToken();
    tokenClient.requestAccessToken({ prompt: "consent" });
  }, [gapiLoaded, tokenClient]);

  const handleSignOut = useCallback(() => {
    if (window.gapi?.client) {
      const token = window.gapi.client.getToken();
      if (token) {
        window.gapi.client.setToken(null);
      }
    }
    clearStoredToken();
    setIsAuthenticated(false);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col items-start space-y-2 w-full">
        {isAuthenticated ? (
        <div className="space-y-2 w-full">
          <Button
            onClick={createPicker}
            disabled={disabled || isLoading}
            className="w-full flex items-center justify-center gap-2"
            variant="outline"
          >
            {isLoading || isApiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Image src="https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-64dp/logo_drive_2020q4_color_2x_web_64dp.png" alt="" width={16} height={16} />
            )}
            {isLoading || isApiLoading ? `Loading... ${!isApiLoading && downloadProgress.toFixed(0) + "%"}` : "Select from Google Drive"}
          </Button>
          <Button
            onClick={handleSignOut}
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
          >
            Sign out from Google
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleAuthClick}
          disabled={disabled || isLoading || isApiLoading}
          className="w-full flex items-center justify-center gap-2"
          variant="outline"
        >
          {isLoading || isApiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Image src="https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-64dp/logo_drive_2020q4_color_2x_web_64dp.png" alt="" width={16} height={16} />
          )}
          {isLoading || isApiLoading ? "Loading..." : "Sign in with Google Drive"}
        </Button>
      )}
      {isLoading && downloadProgress !== null && (
        <Progress value={downloadProgress} className="w-full h-2" />
      )}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 px-1">{error}</p>
      )}
    </div>
  );
}

// ================================================================================= //
// GLOBAL TYPE DECLARATIONS FOR GOOGLE APIS
// ================================================================================= //

// Discriminated union for the Google Identity Services token response.
// This allows for type-safe handling of both success and error cases.
type TokenResponsePayload =
  | {
      access_token: string;
      expires_in: number | string;
      scope: string;
      token_type: "Bearer";
    }
  | {
      error: string;
      error_description?: string;
      error_uri?: string;
    };

declare global {
  interface Window {
    // Extend the existing `gapi` object from `@types/gapi`
    gapi: {
      client: {
        // Provide a more specific type for the `drive.files.get` response when `alt: 'media'`
        // is used, as the standard types are often too generic for this use case.
        drive: {
          files: {
            get: (params: {
              fileId: string;
              alt: "media";
            }) => Promise<{
              status: number;
              body: string; // The body is a string of char codes for media downloads
              headers?: Record<string, string>;
              result?: { error?: string | { message: string } };
            }>;
          };
        };
      };
    };

    // Define the `google.accounts.oauth2` object, which is not included
    // in the standard `@types/gapi` or `@types/google.picker` packages.
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponsePayload) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
          // Define the TokenClient interface for use in component state.
          TokenClient: {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}