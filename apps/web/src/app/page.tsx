export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <div className="glass-card p-12 max-w-2xl">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">AlloHQ</h1>
        <p className="text-xl text-gray-700 mb-8">
          The most beautiful e-commerce marketing automation platform
        </p>
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <span className="font-semibold block mb-1">Multi-Channel</span>
            Email, SMS, WhatsApp, RCS
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <span className="font-semibold block mb-1">E-Commerce Native</span>
            Shopify, WooCommerce, BigCommerce
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <span className="font-semibold block mb-1">AI-Powered</span>
            Smart recommendations & analytics
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <span className="font-semibold block mb-1">Revenue-Focused</span>
            Track dollars, not just opens
          </div>
        </div>
      </div>
    </div>
  );
}
