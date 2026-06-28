"""
认证相关 API 路由

包含功能：
- 登录
- 登出
- Token 验证
"""

import logging
import os
import secrets
from pathlib import Path
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
from .utils import log_request, log_error

logger = logging.getLogger(__name__)

# 加载 backend/.env 中的认证配置
ENV_PATH = Path(__file__).parent.parent / '.env'
load_dotenv(ENV_PATH)

AUTH_USERNAME = os.getenv('AUTH_USERNAME', 'root')
AUTH_PASSWORD = os.getenv('AUTH_PASSWORD', 'ai@2025toor')

# 简单的 token 存储（生产环境建议使用 Redis 或持久化会话存储）
valid_tokens = set()


def _generate_token() -> str:
    """生成随机 token"""
    return secrets.token_hex(32)


def _verify_token(token: str) -> bool:
    """验证 token 是否有效"""
    return token in valid_tokens


def _get_bearer_token() -> str:
    """从 Authorization: Bearer <token> 头中读取 token"""
    return request.headers.get('Authorization', '').replace('Bearer ', '')


def create_auth_blueprint():
    """创建认证路由蓝图（工厂函数，支持多次调用）"""
    auth_bp = Blueprint('auth', __name__)

    @auth_bp.route('/login', methods=['POST'])
    def login():
        """用户登录"""
        try:
            data = request.get_json() or {}
            username = data.get('username', '')
            password = data.get('password', '')

            log_request('/login', {'username': username})

            if username == AUTH_USERNAME and password == AUTH_PASSWORD:
                token = _generate_token()
                valid_tokens.add(token)
                logger.info(f"✅ 用户 {username} 登录成功")
                return jsonify({
                    "success": True,
                    "token": token,
                    "message": "登录成功"
                }), 200

            logger.warning(f"❌ 用户 {username} 登录失败：用户名或密码错误")
            return jsonify({
                "success": False,
                "error": "用户名或密码错误"
            }), 401

        except Exception as e:
            log_error('/login', e)
            return jsonify({
                "success": False,
                "error": f"登录异常: {str(e)}"
            }), 500

    @auth_bp.route('/logout', methods=['POST'])
    def logout():
        """用户登出"""
        try:
            token = _get_bearer_token()
            if token and token in valid_tokens:
                valid_tokens.discard(token)
                logger.info("✅ 用户登出成功")

            return jsonify({
                "success": True,
                "message": "登出成功"
            }), 200

        except Exception as e:
            log_error('/logout', e)
            return jsonify({
                "success": False,
                "error": f"登出异常: {str(e)}"
            }), 500

    @auth_bp.route('/verify', methods=['GET'])
    def verify_token():
        """验证 token 是否有效"""
        try:
            token = _get_bearer_token()
            return jsonify({
                "success": True,
                "valid": _verify_token(token)
            }), 200

        except Exception as e:
            log_error('/verify', e)
            return jsonify({
                "success": False,
                "error": f"验证异常: {str(e)}"
            }), 500

    return auth_bp
