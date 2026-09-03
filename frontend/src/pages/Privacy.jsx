import React from 'react'

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-muted mb-8">Last updated: September 3, 2026</p>
      
      <div className="space-y-6 text-[14px] leading-relaxed text-offwhite/90">
        <section>
          <h2 className="font-semibold text-[16px] mb-2">1. Data We Collect</h2>
          <p>We collect OAuth access tokens, open IDs, usernames, and publishing preferences when you connect social accounts. We do not collect or store your social media passwords. For TikTok, we collect access token, open ID, username, and display name via official TikTok API.</p>
        </section>
        
        <section>
          <h2 className="font-semibold text-[16px] mb-2">2. How We Use Data</h2>
          <p>We use your tokens solely to publish content on your behalf to platforms you have connected (Facebook, Instagram, Threads, LinkedIn, Blogger, TikTok). We do not share your data with third parties except necessary API calls to official social platform APIs.</p>
        </section>
        
        <section>
          <h2 className="font-semibold text-[16px] mb-2">3. TikTok Data</h2>
          <p>For TikTok integration, we request scopes: user.info.basic, video.publish, video.upload. We only use this to get your basic profile info and publish videos you upload. We do not access your private messages or other data.</p>
        </section>
        
        <section>
          <h2 className="font-semibold text-[16px] mb-2">4. Data Storage & Security</h2>
          <p>OAuth tokens are stored securely in encrypted database. We use workspace-based isolation. You can disconnect any platform anytime from Settings page, which deletes associated tokens.</p>
        </section>
        
        <section>
          <h2 className="font-semibold text-[16px] mb-2">5. Your Rights</h2>
          <p>You can request deletion of your data anytime. Disconnecting a platform automatically removes its tokens. Contact us for full data deletion.</p>
        </section>
        
        <section>
          <h2 className="font-semibold text-[16px] mb-2">6. Contact</h2>
          <p>Website: https://nextgenanalytics.cloud-ip.cc/nextgen-analytics-social-media-tool</p>
          <p>Email: support@nextgenanalytics.cloud-ip.cc</p>
        </section>
      </div>
    </div>
  )
}
