import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	ICredentialDataDecryptedObject,
	IDataObject,
	NodeConnectionType,
} from 'n8n-workflow';

/**
 * This is the complete structure for the Sanity n8n node.
 * It defines the node's properties for the UI and contains the
 * full execution logic to communicate with the Sanity Mutations API.
 */
export class SanityMutation implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Sanity Mutation',
		name: 'sanityMutation',
		icon: 'file:sanityMutation.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Create, Read, Update, and Delete documents in Sanity.io',
		defaults: {
			name: 'Sanity',
		},
		inputs: ['main'] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [
			{
				name: 'sanityMutationApi',
				required: true,
			},
		],
		properties: [
			// ... (All properties remain the same)
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'hidden',
				default: 'document',
				noDataExpression: true,
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a document',
					},
					{
						name: 'Create if Not Exists',
						value: 'createIfNotExists',
						action: 'Create a document if it does not exist',
					},
					{
						name: 'Create or Replace',
						value: 'createOrReplace',
						action: 'Create or replace a document',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a document',
					},
					{
						name: 'Get Documents',
						value: 'get',
						action: 'Get documents',
					},
					{
						name: 'Patch (Update)',
						value: 'patch',
						action: 'Patch partially update a document',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Document ID',
				name: 'documentId',
				type: 'string',
				default: '',
				placeholder: 'doc-ID-12345',
				description:
					'The ID of the document to operate on. If creating and left blank, a random ID will be generated. For Get Documents, this is optional when using a custom GROQ query.',
				displayOptions: {
					show: {
						operation: ['create', 'createOrReplace', 'createIfNotExists', 'delete', 'patch'],
					},
				},
			},
			{
				displayName: 'Get Mode',
				name: 'getMode',
				type: 'options',
				options: [
					{
						name: 'Auto (Query Then ID)',
						value: 'auto',
						description: 'Use GROQ query if provided, otherwise fetch by Document ID',
					},
					{
						name: 'By Document ID',
						value: 'byId',
						description: 'Fetch a single document by ID',
					},
					{
						name: 'By GROQ Query',
						value: 'byQuery',
						description: 'Fetch documents using a custom GROQ query',
					},
					{
						name: 'By Document Type',
						value: 'byType',
						description: 'Fetch documents by _type with pagination',
					},
				],
				default: 'auto',
				displayOptions: {
					show: {
						operation: ['get'],
					},
				},
			},
			{
				displayName: 'Document ID',
				name: 'documentId',
				type: 'string',
				default: '',
				placeholder: 'doc-ID-12345',
				description: 'The ID of the document to fetch',
				displayOptions: {
					show: {
						operation: ['get'],
						getMode: ['auto', 'byId'],
					},
				},
			},
			{
				displayName: 'GROQ Query',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: '*[_type == "post"][0...10]',
				description: 'Optional GROQ query. If empty, the node fetches one document by Document ID.',
				displayOptions: {
					show: {
						operation: ['get'],
						getMode: ['auto', 'byQuery'],
					},
				},
			},
			{
				displayName: 'Document Type',
				name: 'documentType',
				type: 'string',
				default: '',
				placeholder: 'post',
				description: 'The Sanity _type value to fetch',
				displayOptions: {
					show: {
						operation: ['get'],
						getMode: ['byType'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 10,
				description: 'Maximum number of documents to return',
				displayOptions: {
					show: {
						operation: ['get'],
						getMode: ['byType'],
					},
				},
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				typeOptions: {
					minValue: 0,
				},
				default: 0,
				description: 'Number of matching documents to skip before returning results',
				displayOptions: {
					show: {
						operation: ['get'],
						getMode: ['byType'],
					},
				},
			},
			{
				displayName: 'Document Data',
				name: 'documentJson',
				type: 'json',
				typeOptions: {
					alwaysOpen: true,
				},
				default: '{}',
				description:
					'The JSON data for the document or patch operation. For "Create", this is the full document. For "Patch", this specifies the patch operations.',
				displayOptions: {
					show: {
						operation: ['create', 'createOrReplace', 'createIfNotExists', 'patch'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Return Documents',
						name: 'returnDocuments',
						type: 'boolean',
						default: true,
						description: 'Whether to return the full document(s) in mutation responses',
						displayOptions: {
							show: {
								'/operation': ['create', 'createIfNotExists', 'createOrReplace', 'delete', 'patch'],
							},
						},
					},
					{
						displayName: 'API Version',
						name: 'apiVersion',
						type: 'string',
						default: 'v2024-06-21',
						description: 'The Sanity API version to use',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = (await this.getCredentials(
			'sanityMutationApi',
		)) as ICredentialDataDecryptedObject;
		const projectId = credentials.projectId as string;
		const dataset = credentials.dataset as string;
		const token = credentials.token as string;

		if (!projectId || !dataset || !token) {
			throw new NodeOperationError(this.getNode(), 'Credentials are not valid!');
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;
				const documentId = this.getNodeParameter('documentId', itemIndex, '') as string;
				const query = this.getNodeParameter('query', itemIndex, '') as string;
				const getMode = this.getNodeParameter('getMode', itemIndex, 'auto') as string;
				const documentType = this.getNodeParameter('documentType', itemIndex, '') as string;
				const limit = this.getNodeParameter('limit', itemIndex, 10) as number;
				const offset = this.getNodeParameter('offset', itemIndex, 0) as number;

				const options = this.getNodeParameter('options', itemIndex, {}) as {
					returnDocuments?: boolean;
					apiVersion?: string;
				};

				const apiVersion = options.apiVersion || 'v2024-06-21';

				const encodeGroqParam = (value: string | number | boolean): string => JSON.stringify(value);

				if (operation === 'get') {
					let resolvedQuery = '';
					let queryParams: IDataObject = {};

					if (getMode === 'auto') {
						if (query) {
							resolvedQuery = query;
						} else if (documentId) {
							resolvedQuery = '*[_id == $id][0]';
							queryParams = { $id: encodeGroqParam(documentId) };
						} else {
							throw new NodeOperationError(
								this.getNode(),
								'In auto mode, provide either Document ID or GROQ Query.',
								{ itemIndex },
							);
						}
					} else if (getMode === 'byId') {
						if (!documentId) {
							throw new NodeOperationError(
								this.getNode(),
								'Document ID is required when Get Mode is "By Document ID".',
								{ itemIndex },
							);
						}
						resolvedQuery = '*[_id == $id][0]';
						queryParams = { $id: encodeGroqParam(documentId) };
					} else if (getMode === 'byQuery') {
						if (!query) {
							throw new NodeOperationError(
								this.getNode(),
								'GROQ Query is required when Get Mode is "By GROQ Query".',
								{ itemIndex },
							);
						}
						resolvedQuery = query;
					} else if (getMode === 'byType') {
						if (!documentType) {
							throw new NodeOperationError(
								this.getNode(),
								'Document Type is required when Get Mode is "By Document Type".',
								{ itemIndex },
							);
						}
						const pageSize = Math.max(1, Math.floor(limit));
						const start = Math.max(0, Math.floor(offset));
						resolvedQuery = '*[_type == $type][$offset...$end]';
						queryParams = {
							$type: encodeGroqParam(documentType),
							$offset: encodeGroqParam(start),
							$end: encodeGroqParam(start + pageSize),
						};
					} else {
						throw new NodeOperationError(this.getNode(), `Unsupported Get Mode: ${getMode}`, {
							itemIndex,
						});
					}

					const queryUrl = `https://${projectId}.api.sanity.io/${apiVersion}/data/query/${dataset}`;
					const queryResponse = (await this.helpers.httpRequest({
						method: 'GET',
						url: queryUrl,
						headers: {
							Authorization: `Bearer ${token}`,
						},
						qs: {
							query: resolvedQuery,
							...queryParams,
						},
						json: true,
					})) as IDataObject;

					const queryResult = queryResponse.result as IDataObject | IDataObject[] | null;
					const normalizedResult = Array.isArray(queryResult)
						? queryResult
						: queryResult
							? [queryResult]
							: [];

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(normalizedResult),
						{ itemData: { item: itemIndex } },
					);
					returnData.push(...executionData);
					continue;
				}

				const documentJsonString = this.getNodeParameter('documentJson', itemIndex, '{}') as string;
				let documentJson: IDataObject;
				try {
					documentJson = JSON.parse(documentJsonString);
				} catch (e) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid JSON in "Document Data" field: ${e.message}`,
						{ itemIndex },
					);
				}

				const url = `https://${projectId}.api.sanity.io/${apiVersion}/data/mutate/${dataset}`;

				const mutations: IDataObject[] = [];
				const mutationPayload: IDataObject = {};

				// ** BUG FIX: Added separate logic for the patch operation **
				if (operation === 'delete') {
					if (!documentId) {
						throw new NodeOperationError(
							this.getNode(),
							'Document ID is required for delete operation.',
						);
					}
					mutationPayload[operation] = { id: documentId };
				} else if (operation === 'patch') {
					if (!documentId) {
						throw new NodeOperationError(
							this.getNode(),
							'Document ID is required for patch operation.',
						);
					}
					const patchData = { ...documentJson };
					// A patch operation requires the ID to be at the top level of the patch object, with the key 'id'
					patchData.id = documentId;
					mutationPayload[operation] = patchData;
				} else {
					// Handles create, createOrReplace, createIfNotExists
					const createData = { ...documentJson };
					// A create operation can optionally have an ID, with the key '_id'
					if (documentId) {
						createData._id = documentId;
					}
					mutationPayload[operation] = createData;
				}
				mutations.push(mutationPayload);

				const responseData = await this.helpers.httpRequest({
					method: 'POST',
					url,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: { mutations },
					qs: {
						returnDocuments: options.returnDocuments,
					},
					json: true,
				});

				const results = (responseData as IDataObject).results as IDataObject[];
				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(results),
					{ itemData: { item: itemIndex } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					const executionErrorData = {
						json: {
							error: error.message,
						},
						pairedItem: {
							item: itemIndex,
						},
					};
					returnData.push(executionErrorData);
					continue;
				}

				if (error.isAxiosError && error.response && error.response.data) {
					const detailedError = JSON.stringify(error.response.data, null, 2);
					throw new NodeOperationError(this.getNode(), `Sanity API Error: ${detailedError}`, {
						itemIndex,
					});
				}

				throw error;
			}
		}

		return this.prepareOutputData(returnData);
	}
}
