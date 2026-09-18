import { createContext, useContext } from "react";
import { FenixUser } from "../api/fenix";

export const UserContext = createContext<FenixUser | null>(null);

export function useFenixUser(): FenixUser | null {
  return useContext(UserContext);
}
