Page({
    data: {
        selectedType: ''
    },

    onSelectType(e) {
        const type = e.detail.type;
        this.setData({ selectedType: type });

        // Navigate to input page
        wx.navigateTo({
            url: `/pages/input/input?type=${type}`
        });
    }
})
