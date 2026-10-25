import { apiService } from "./api";
import { mockService } from "./mocks/service";
export const isDemo = import.meta.env.VITE_DATA_SOURCE === "demo";
export const service = isDemo ? mockService : apiService;
