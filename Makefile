./node_modules/.bin/usenode-release:
	npm install --dev

release: ./node_modules/.bin/usenode-release
	./node_modules/.bin/usenode-release .

.PHONY: release