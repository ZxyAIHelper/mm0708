// app.js
App({
    onLaunch() {
        // 展示本地存储能力
        const logs = wx.getStorageSync('logs') || []
        logs.unshift(Date.now())
        wx.setStorageSync('logs', logs)

        // 微信登录授权
        this.wxLogin()
    },

    wxLogin() {
        wx.login({
            success: res => {
                if (res.code) {
                    // 获取用户信息
                    wx.getUserProfile({
                        desc: '用于完善用户资料',
                        success: (userRes) => {
                            // 发送 code 和 userInfo 到后台
                            this.authWithBackend(res.code, userRes.userInfo)
                        },
                        fail: () => {
                            // 用户拒绝授权，仍然发送 code 创建匿名用户
                            this.authWithBackend(res.code)
                        }
                    })
                } else {
                    console.error('微信登录失败', res.errMsg)
                    wx.showToast({
                        title: '登录失败，请重试',
                        icon: 'none'
                    })
                }
            },
            fail: () => {
                wx.showToast({
                    title: '登录失败，请重试',
                    icon: 'none'
                })
            }
        })
    },

    authWithBackend(code, userInfo) {
        const API_BASE = 'https://api.mm0708.top'

        wx.request({
            url: `${API_BASE}/api/couplet/auth`,
            method: 'POST',
            data: {
                code,
                userInfo: userInfo ? {
                    nickName: userInfo.nickName,
                    avatarUrl: userInfo.avatarUrl
                } : undefined
            },
            success: (res) => {
                if (res.data.success) {
                    // 保存用户信息到全局数据
                    this.globalData.userInfo = res.data.user
                    console.log('用户登录成功', res.data.user)
                } else {
                    console.error('后端认证失败', res.data)
                }
            },
            fail: (err) => {
                console.error('认证请求失败', err)
            }
        })
    },

    globalData: {
        userInfo: null,
        generatedCouplet: null
    }
})
