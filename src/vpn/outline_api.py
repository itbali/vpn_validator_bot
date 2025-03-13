import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import requests
import logging
from config.settings import OUTLINE_API_URL

logger = logging.getLogger(__name__)

class OutlineVPN:
    def __init__(self):
        self.api_url = OUTLINE_API_URL

    def get_user_key(self, username: str) -> dict:
        """Get existing access key for a user"""
        all_keys = self.get_all_keys()
        for key in all_keys:
            if key.get('name') == username:
                return key
        return None

    def create_access_key(self, name: str) -> dict:
        """Create a new access key for a user"""
        try:
            response = requests.post(
                f"{self.api_url}/access-keys",
                verify=False,
                headers={'Content-Type': 'application/json'},
                json={"method": "chacha20-ietf-poly1305"}
            )
            if response.status_code == 201:
                key_data = response.json()
                self.rename_key(key_data['id'], name)
                return key_data
            print(f"Error creating key: {response.status_code} - {response.text}")
            return None
        except Exception as e:
            print(f"Exception creating key: {str(e)}")
            return None

    def delete_access_key(self, key_id: str) -> bool:
        """Delete an access key"""
        try:
            response = requests.delete(
                f"{self.api_url}/access-keys/{key_id}",
                verify=False
            )
            return response.status_code == 204
        except Exception as e:
            print(f"Exception deleting key: {str(e)}")
            return False

    def rename_key(self, key_id: str, name: str) -> bool:
        """Rename an access key"""
        try:
            response = requests.put(
                f"{self.api_url}/access-keys/{key_id}/name",
                verify=False,
                headers={'Content-Type': 'application/json'},
                json={"name": name}
            )
            return response.status_code == 204
        except Exception as e:
            print(f"Exception renaming key: {str(e)}")
            return False

    def get_all_keys(self) -> list:
        """Get all access keys"""
        try:
            response = requests.get(
                f"{self.api_url}/access-keys",
                verify=False
            )
            if response.status_code == 200:
                return response.json()['accessKeys']
            print(f"Error getting keys: {response.status_code} - {response.text}")
            return []
        except Exception as e:
            print(f"Exception getting keys: {str(e)}")
            return []

    def get_key_info(self, key_id: str) -> dict:
        """Get information about a specific key"""
        try:
            logger.error(f"Getting metrics for key ID: {key_id}")
            result = {
                'data_usage': 0,
                'last_active': None,
                'name': ''
            }

            # Получаем метрики использования трафика
            transfer_response = requests.get(
                f"{self.api_url}/metrics/transfer",
                verify=False
            )
            logger.error(f"Transfer metrics response status: {transfer_response.status_code}")
            logger.error(f"Transfer metrics response body: {transfer_response.text}")
            
            # Получаем метрики активности
            enabled_response = requests.get(
                f"{self.api_url}/metrics/enabled",
                verify=False
            )
            logger.error(f"Enabled metrics response status: {enabled_response.status_code}")
            logger.error(f"Enabled metrics response body: {enabled_response.text}")
            
            if transfer_response.status_code == 200:
                metrics = transfer_response.json()
                
                # Получаем метрики из словаря
                logger.error(f"Looking for metrics for key ID: {key_id}")
                logger.error(f"Available metrics: {metrics}")
                
                bytes_by_user = metrics.get('bytesTransferredByUserId', {})
                logger.error(f"Bytes by user: {bytes_by_user}")
                
                # Пробуем найти метрики для ключа в разных форматах
                key_variants = [str(key_id), key_id, int(key_id) if key_id.isdigit() else None]
                logger.error(f"Trying key variants: {key_variants}")
                
                for key_variant in key_variants:
                    if key_variant is not None and str(key_variant) in bytes_by_user:
                        logger.error(f"Found matching metric for key variant {key_variant}")
                        result['data_usage'] = bytes_by_user[str(key_variant)]
                        logger.error(f"Set data_usage={result['data_usage']}")
                        break

            # Обрабатываем информацию о последней активности
            if enabled_response.status_code == 200:
                enabled_metrics = enabled_response.json()
                logger.error(f"Processing enabled metrics: {enabled_metrics}")
                
                # Ищем время последней активности
                key_variants = [str(key_id), key_id, int(key_id) if key_id.isdigit() else None]
                for key_variant in key_variants:
                    if key_variant is not None and str(key_variant) in enabled_metrics:
                        result['last_active'] = enabled_metrics[str(key_variant)]
                        logger.error(f"Found last active time: {result['last_active']}")
                        break
                
            # Получаем имя ключа
            logger.error(f"Getting key name for ID: {key_id}")
            key_response = requests.get(
                f"{self.api_url}/access-keys/{key_id}",
                verify=False
            )
            logger.error(f"Key name response status: {key_response.status_code}")
            logger.error(f"Key name response body: {key_response.text}")
            
            if key_response.status_code == 200:
                key_data = key_response.json()
                result['name'] = key_data.get('name', '')
                result['id'] = key_data.get('id', '')
                logger.error(f"Set key name: {result['name']}")
                logger.error(f"Key data from API: {key_data}")
            
            logger.error(f"Final result: {result}")
            return result
                
        except Exception as e:
            logger.error(f"Exception getting key info: {str(e)}")
            return {
                'data_usage': 0,
                'last_active': None,
                'name': ''
            } 