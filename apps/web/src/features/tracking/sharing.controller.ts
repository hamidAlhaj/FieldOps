import type { SharingSession, LocationSample } from "./tracking.api";
export type SharingState = {
  phase: "idle" | "starting" | "sharing";
  session: SharingSession | null;
  message: string;
};
type Api = {
  start(workOrderId: string): Promise<SharingSession>;
  stop(id: string): Promise<void>;
  sample(
    id: string,
    sample: LocationSample,
    signal: AbortSignal,
  ): Promise<SharingSession>;
};
/** No browser location access until the explicit start() command. */
export class SharingController {
  private generation = 0;
  private watch: number | undefined;
  private session: SharingSession | null = null;
  private upload: AbortController | undefined;
  private lastAttempt = -Infinity;
  private disposed = false;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private lastRecordedAt = -Infinity;
  private phase: SharingState["phase"] = "idle";
  constructor(
    private api: Api,
    private geo: Geolocation,
    private changed: (state: SharingState) => void,
    private now = Date.now,
  ) {}
  private publish(message: string) {
    if (!this.disposed)
      this.changed({ phase: this.phase, session: this.session, message });
  }
  private armExpiry(generation: number) {
    clearTimeout(this.expiry);
    this.expiry = setTimeout(
      () => {
        if (generation === this.generation)
          void this.stop(
            "No fresh location was received in time. Sharing stopped.",
          );
      },
      Math.max(
        0,
        Math.min(120000, Date.parse(this.session!.expiresAt) - this.now()),
      ),
    );
  }
  async start(workOrderId: string, consent: boolean) {
    if (!consent || this.disposed || this.phase !== "idle") return;
    const generation = ++this.generation;
    this.phase = "starting";
    this.publish("Requesting a location-sharing session…");
    try {
      const session = await this.api.start(workOrderId);
      if (generation !== this.generation || this.disposed) {
        await this.api.stop(session.id).catch(() => {});
        return;
      }
      this.session = session;
      this.phase = "sharing";
      this.lastAttempt = -Infinity;
      this.lastRecordedAt = -Infinity;
      this.armExpiry(generation);
      this.publish("Waiting for your device location.");
      const watch = this.geo.watchPosition(
        (position) => {
          void this.position(position, generation);
        },
        (error) => {
          if (generation !== this.generation) return;
          void this.stop(
            error.code === 1
              ? "Location permission denied. Sharing stopped."
              : "Your device could not provide a location. Sharing stopped.",
          );
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 20000 },
      );
      // Some implementations/tests may synchronously call an error callback.
      if (generation !== this.generation) this.geo.clearWatch(watch);
      else this.watch = watch;
    } catch (error) {
      if (generation === this.generation && !this.disposed)
        await this.stop(
          error instanceof Error ? error.message : "Could not start sharing.",
        );
    }
  }
  private async position(position: GeolocationPosition, generation: number) {
    if (
      generation !== this.generation ||
      !this.session ||
      this.upload ||
      this.disposed ||
      this.now() - this.lastAttempt < 15000
    )
      return;
    const { latitude, longitude, accuracy } = position.coords;
    if (
      ![latitude, longitude, accuracy, position.timestamp].every(
        Number.isFinite,
      ) ||
      accuracy < 0 ||
      accuracy > 10000
    ) {
      await this.stop("Location accuracy is unavailable. Sharing stopped.");
      return;
    }
    // Never resend an old fix as if it were newly measured.
    if (
      position.timestamp <= this.lastRecordedAt ||
      this.now() - position.timestamp > 30000 ||
      position.timestamp > this.now() + 5000
    )
      return;
    this.lastAttempt = this.now();
    this.lastRecordedAt = position.timestamp;
    const upload = new AbortController();
    this.upload = upload;
    try {
      const result = await this.api.sample(
        this.session.id,
        {
          latitude,
          longitude,
          accuracyMeters: accuracy,
          recordedAt: new Date(position.timestamp).toISOString(),
        },
        upload.signal,
      );
      if (generation === this.generation && !this.disposed) {
        this.session = result;
        this.armExpiry(generation);
        this.publish("Location sharing is on.");
      }
    } catch {
      if (generation === this.generation && !this.disposed)
        await this.stop(
          "Location could not be sent. Sharing stopped; start again when connected.",
        );
    } finally {
      if (this.upload === upload) this.upload = undefined;
    }
  }
  async stop(message = "Location sharing is off.") {
    ++this.generation;
    clearTimeout(this.expiry);
    this.expiry = undefined;
    if (this.watch !== undefined) {
      this.geo.clearWatch(this.watch);
      this.watch = undefined;
    }
    this.upload?.abort();
    this.upload = undefined;
    const session = this.session;
    this.session = null;
    this.phase = "idle";
    this.publish(message);
    if (session) {
      try {
        await this.api.stop(session.id);
      } catch {
        if (!this.disposed && this.phase === "idle")
          this.publish(
            "Device tracking stopped. Server sharing expires within two minutes if the stop request cannot reach it.",
          );
      }
    }
  }
  get currentSession() {
    return this.session;
  }
  dispose() {
    this.disposed = true;
    void this.stop();
  }
}
