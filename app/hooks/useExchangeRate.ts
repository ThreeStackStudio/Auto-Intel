import { useEffect, useState } from "react";

import { getUsdToCadRate } from "../services/exchangeRate";

export function useExchangeRate() {
  const [rate, setRate] = useState(1.36);

  useEffect(() => {
    void getUsdToCadRate().then(setRate);
  }, []);

  return rate;
}
