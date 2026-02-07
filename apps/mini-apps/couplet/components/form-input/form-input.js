Component({
    properties: {
        label: {
            type: String,
            value: ''
        },
        value: {
            type: String,
            value: ''
        },
        placeholder: {
            type: String,
            value: ''
        },
        maxlength: {
            type: Number,
            value: 20
        },
        hint: {
            type: String,
            value: ''
        },
        field: {
            type: String,
            value: ''
        },
        long: {
            type: Boolean,
            value: false
        }
    },

    methods: {
        onInput(e) {
            this.triggerEvent('change', {
                field: this.data.field,
                value: e.detail.value
            })
        }
    }
})
