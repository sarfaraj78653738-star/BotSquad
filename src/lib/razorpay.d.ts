// Minimal types for react-native-razorpay (the package ships no
// .d.ts). Covers only the subscription-checkout call this app uses.
declare module 'react-native-razorpay' {
  export interface RazorpayOptions {
    key: string;
    subscription_id: string;
    name?: string;
    description?: string;
    prefill?: { name?: string; email?: string; contact?: string };
    theme?: { color?: string };
  }
  export interface RazorpaySuccess {
    razorpay_payment_id: string;
    razorpay_subscription_id?: string;
    razorpay_signature?: string;
  }
  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccess>;
  };
  export default RazorpayCheckout;
}
